from django.db.models import Q
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from interviews.models import InterviewSession, Question
import PyPDF2
import json
import uuid
from groq import Groq
import re
client = Groq(api_key="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")

def get_groq_response(prompt):
    try:
        response = client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama3-70b-8192",
            temperature=0.7,
            max_tokens=1024
        )

        content = response.choices[0].message.content
        print(f"LLM Raw Response: {content}")

        start_index = content.find("{")
        end_index = content.rfind("}")
        if start_index == -1 or end_index == -1:
            return {"error": "No valid JSON block found in LLM response"}
        
        # Extract the raw JSON block
        raw_json = content[start_index:end_index + 1]
        # Remove control characters (ASCII control characters: 0x00 to 0x1F)
        clean_json = re.sub(r'[\x00-\x1f]+', ' ', raw_json)
        
        result = json.loads(clean_json)
        return result

    except json.JSONDecodeError as e:
        return {"error": f"Failed to parse LLM response as JSON: {str(e)}"}
    except Exception as e:
        return {"error": f"LLM API error: {str(e)}"}

@api_view(['POST'])
def create_session(request):
    if 'resume' not in request.FILES:
        return Response({"error": "No resume uploaded"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        resume_file = request.FILES['resume']

        # Extract text from resume
        try:
            pdf_reader = PyPDF2.PdfReader(resume_file)
            text = "\n".join(
                page.extract_text() for page in pdf_reader.pages if page.extract_text()
            )
            if not text.strip():
                return Response(
                    {"error": "Could not extract text from PDF"},
                    status=status.HTTP_400_BAD_REQUEST
                )
        except Exception as e:
            return Response(
                {"error": f"PDF processing error: {str(e)}"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Generate initial question
        prompt = f"""
        Based on this resume, generate 1 diverse and relevant interview question that covers topics across different areas (e.g., technical skills, problem-solving). 
        Avoid repeating the same topic (e.g., database optimization) across questions. Ensure the question is context-aware.

        Resume text: {text[:3000]}
        Return this exact JSON format: {{"questions": ["question 1"]}}
        Evaluate the following code submitted by a candidate.
        Provide detailed feedback and a rating from 1 to 10.
        Return the answer strictly in JSON format exactly as:
        {{"feedback": "Your detailed feedback here", "rating": <number between 1 and 10>}}
        Code:
        """
        
        groq_response = get_groq_response(prompt)

        if 'error' in groq_response:
            return Response(groq_response, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        questions = groq_response.get('questions', [])
        if not questions or not isinstance(questions, list):
            return Response(
                {"error": "Invalid response format from LLM"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
                content_type='application/json'
            )

        # Save the session and initial question
        session = InterviewSession.objects.create(
            resume=resume_file,
            parsed_data={
                "text": text,
                "questions": questions
            }
        )

        for question_text in questions:
            Question.objects.create(session=session, text=question_text)

        return Response({
            "session_id": session.id,
            "questions": questions
        }, status=status.HTTP_201_CREATED)

    except Exception as e:
        return Response({
            "error": f"Unexpected error: {str(e)}",
            "type": type(e).__name__
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@csrf_exempt
@api_view(['POST'])
def submit_answer(request, session_id):
    try:
        session = InterviewSession.objects.get(id=session_id)

        # Get the current unanswered question
        question = Question.objects.filter(
            Q(session=session) & (Q(answer__isnull=True) | Q(answer__exact=""))
        ).first()

        if not question:
            return Response(
                {"error": "No pending questions"},
                status=status.HTTP_404_NOT_FOUND,
                content_type='application/json'
            )

        answer_text = request.data.get('answer', '')
        if not answer_text:
            return Response(
                {"error": "Empty answer"},
                status=status.HTTP_400_BAD_REQUEST,
                content_type='application/json'
            )

        # Generate a follow-up question, considering diversity
        previous_questions = Question.objects.filter(session=session).values_list('text', flat=True)
        previous_questions_str = "\n".join(previous_questions)

        prompt = f"""
        Analyze the following answer and generate a follow-up question that explores a new area of expertise (technical, problem-solving, or soft skills) while maintaining context diversity.
        Do not repeat topics already covered in these questions:
        {previous_questions_str}

        Current Question: {question.text}
        Answer: {answer_text}
        JSON format: {{"follow_up_question": "new question"}}
        """

        groq_response = get_groq_response(prompt)

        if 'error' in groq_response:
            return Response(
                groq_response,
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
                content_type='application/json'
            )

        follow_up_question = groq_response.get('follow_up_question', None)
        if follow_up_question:
            Question.objects.create(session=session, text=follow_up_question)

        # Update the current question with answer and feedback
        question.answer = answer_text
        question.rating = groq_response.get('rating', 0)
        question.feedback = groq_response.get('feedback', '')
        question.save()

        return Response({
            "success": True,
            "rating": question.rating,
            "feedback": question.feedback,
            "follow_up_question": follow_up_question,
            "has_next_question": Question.objects.filter(
                Q(session=session) & (Q(answer__isnull=True) | Q(answer__exact=""))
            ).exists()
        }, status=status.HTTP_200_OK, content_type='application/json')

    except InterviewSession.DoesNotExist:
        return Response(
            {"error": "Invalid session ID"},
            status=status.HTTP_404_NOT_FOUND,
            content_type='application/json'
        )
    except Exception as e:
        return Response(
            {"error": str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content_type='application/json'
        )
from datetime import datetime
@csrf_exempt
@api_view(['POST'])
def submit_test(request, session_id):
    """
    Handle the final submission of the interview test.
    Marks the session as complete and generates final feedback.
    """
    try:
        # Get the session
        session = InterviewSession.objects.get(id=session_id)

        # Check if session is already completed
        if session.status == 'completed':
            return Response(
                {"error": "Test has already been submitted"},
                status=status.HTTP_400_BAD_REQUEST,
                content_type='application/json'
            )

        # Check if all questions have been answered
        # unanswered_questions = Question.objects.filter(
        #     Q(session=session) & (Q(answer__isnull=True) | Q(answer__exact=""))
        # ).exists()

        # if unanswered_questions:
        #     return Response(
        #         {"error": "Cannot submit test with unanswered questions"},
        #         status=status.HTTP_400_BAD_REQUEST,
        #         content_type='application/json'
        #     )

        # Generate final feedback using Groq
        questions_and_answers = Question.objects.filter(session=session).values('text', 'answer')
        qa_text = "\n".join([f"Q: {qa['text']}\nA: {qa['answer']}" for qa in questions_and_answers])

        prompt = f"""
        Review all questions and answers from this interview session and provide a final assessment.
        
        Interview QA:
        {qa_text}

        Provide feedback in this JSON format:
        {{
            "overall_rating": <score between 1-10>,
            "summary": "brief overall assessment",
            "strengths": ["key strength 1", "key strength 2"],
            "areas_for_improvement": ["area 1", "area 2"]
        }}
        """

        groq_response = get_groq_response(prompt)
        
        if 'error' in groq_response:
            return Response(
                {"error": "Failed to generate final feedback"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
                content_type='application/json'
            )

        # Update session status and feedback
        session.status = 'completed'
        session.completed_at = datetime.now()
        session.final_feedback = groq_response
        session.save()

        return Response({
            "success": True,
            "message": "Test submitted successfully",
            "feedback": groq_response,
            "completed_at": session.completed_at
        }, status=status.HTTP_200_OK, content_type='application/json')

    except InterviewSession.DoesNotExist:
        return Response(
            {"error": "Invalid session ID"},
            status=status.HTTP_404_NOT_FOUND,
            content_type='application/json'
        )
    except Exception as e:
        return Response(
            {"error": f"Unexpected error: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content_type='application/json'
        )

# views.py
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from datetime import datetime
import json

@csrf_exempt
@api_view(['POST'])
def submit_code(request, session_id):
    """
    Handle submission of the coding round.
    Expects a JSON payload with a 'code' field containing the candidate's Python code.
    """
    try:
        session = InterviewSession.objects.get(id=session_id)
        code_text = request.data.get('code', '')
        if not code_text.strip():
            return Response({"error": "No code provided."}, status=status.HTTP_400_BAD_REQUEST)

        # Create a prompt that instructs the LLM to evaluate the candidate's Python code.
        prompt = f"""
        Evaluate the following Python code submitted by a candidate in a coding round.
        Provide detailed feedback explaining strengths and areas for improvement,
        and assign a rating from 1 to 10. Return your answer in the JSON format:
        {{"feedback": "your feedback", "rating": <number>}}
        Code:
        {code_text}
        """

        groq_response = get_groq_response(prompt)
        if 'error' in groq_response:
            return Response(groq_response, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        # Save the coding round feedback on the session
        session.final_coding_feedback = groq_response
        session.save()

        return Response({
            "success": True,
            "feedback": groq_response.get('feedback'),
            "rating": groq_response.get('rating')
        }, status=status.HTTP_200_OK)

    except InterviewSession.DoesNotExist:
        return Response({"error": "Invalid session ID"}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({"error": str(e)},
                        status=status.HTTP_500_INTERNAL_SERVER_ERROR)
