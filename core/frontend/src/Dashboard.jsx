// Dashboard.jsx
import React, { useState, useEffect, useRef, memo } from 'react';
import { Upload, LoaderCircle, CheckCircle, FileText, Send, User, Bot } from 'lucide-react';
import AceEditor from 'react-ace';
import { motion } from 'framer-motion';
import Timer from './Timer';

// Import Ace Editor modes and theme
import "ace-builds/src-noconflict/mode-python";
import "ace-builds/src-noconflict/mode-javascript";
import "ace-builds/src-noconflict/mode-java";
import "ace-builds/src-noconflict/mode-c_cpp";
import "ace-builds/src-noconflict/theme-monokai";
import "ace-builds/src-noconflict/ext-language_tools";

const LOCAL_STORAGE_KEY = 'interviewSession';

const Dashboard = () => {
  // Session & Q&A state
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // step: "qa", "transition", "coding", or "thankyou"
  const [step, setStep] = useState("qa");
  // AI typing indicator state
  const [aiTyping, setAiTyping] = useState(false);

  // Coding Round state
  const codingQuestions = [
    "Question 1: Write a function that checks whether a given number is prime.",
    "Question 2: Implement a function that reverses a string.",
    "Question 3: Write a function that merges two sorted arrays into one sorted array."
  ];
  const [currentCodingIndex, setCurrentCodingIndex] = useState(0);
  const [codingSubmissions, setCodingSubmissions] = useState(
    codingQuestions.map(() => ({ language: "python", code: "" }))
  );
  const [codingFeedbacks, setCodingFeedbacks] = useState(
    codingQuestions.map(() => null)
  );
  const baseTemplates = {
    python: "def solve():\n    # Write your code here\n    pass\n",
    javascript: "function solve() {\n  // Write your code here\n}\n",
    java: "public class Solution {\n    public static void main(String[] args) {\n        // Write your code here\n    }\n}\n",
    cpp: "#include <iostream>\nusing namespace std;\n\nint main() {\n    // Write your code here\n    return 0;\n}\n",
  };

  // Pre-populate coding question with template if empty.
  useEffect(() => {
    setCodingSubmissions(prev => {
      const newSubs = [...prev];
      if (!newSubs[currentCodingIndex].code.trim()) {
        newSubs[currentCodingIndex].code = baseTemplates[newSubs[currentCodingIndex].language];
      }
      return newSubs;
    });
  }, [currentCodingIndex]);

  // Q&A scrolling
  const chatEndRef = useRef(null);
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, aiTyping]);

  const API_BASE_URL = "http://localhost:8000";

  // Restore state from localStorage on mount
  useEffect(() => {
    const savedSession = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (savedSession) {
      const {
        sessionId: savedId,
        step: savedStep,
        messages: savedMessages,
        currentCodingIndex: savedIndex,
        codingSubmissions: savedSubs,
        codingFeedbacks: savedFeedbacks,
      } = JSON.parse(savedSession);
      if (savedStep === "thankyou") {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
        return;
      }
      setSessionId(savedId);
      setStep(savedStep);
      setMessages(savedMessages);
      setCurrentCodingIndex(savedIndex);
      setCodingSubmissions(savedSubs);
      setCodingFeedbacks(savedFeedbacks);
    }
  }, []);

  // Persist state to localStorage
  useEffect(() => {
    if (sessionId || step === "thankyou") {
      const sessionData = {
        sessionId,
        step,
        messages,
        currentCodingIndex,
        codingSubmissions,
        codingFeedbacks,
      };
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(sessionData));
    }
  }, [sessionId, step, messages, currentCodingIndex, codingSubmissions, codingFeedbacks]);

  // Clear state on test completion
  useEffect(() => {
    if (step === "thankyou") {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      localStorage.removeItem("testStartTime");
    }
  }, [step]);

  // When in "transition" phase, delay for 2 seconds then move to coding phase.
  useEffect(() => {
    if (step === "transition") {
      const timer = setTimeout(() => {
        setStep("coding");
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [step]);

  // File upload & session creation (Q&A)
  const handleFileChange = (event) => {
    const selectedFile = event.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
    }
  };

  const createSession = async () => {
    if (!file) {
      setError("Please select a file before starting the session.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('resume', file);
      const response = await fetch(`${API_BASE_URL}/api/create-session/`, {
        method: 'POST',
        body: formData,
      });
      const textResponse = await response.text();
      if (!response.ok) {
        try {
          const errorData = JSON.parse(textResponse);
          throw new Error(errorData.error || "Failed to create session");
        } catch (err) {
          throw new Error("Unexpected API response: " + textResponse);
        }
      }
      const data = JSON.parse(textResponse);
      if (!data.session_id || !data.questions) {
        throw new Error("Invalid API response structure");
      }
      setSessionId(data.session_id);
      // Reset test start time for each new test.
      localStorage.setItem("testStartTime", Date.now());
      if (data.questions && data.questions.length > 0) {
        setMessages([{ type: "ai", content: data.questions[0] }]);
      }
    } catch (error) {
      console.error("Error creating session:", error);
      setError(error.message);
    } finally {
      setUploading(false);
    }
  };

  // Q&A round: Submit answer
  const submitAnswer = async () => {
    if (!sessionId) {
      setError("Session ID is missing.");
      return;
    }
    if (!userInput.trim()) {
      setError("Answer cannot be empty.");
      return;
    }
    const answer = userInput.trim();
    setUserInput("");
    setMessages(prev => [...prev, { type: "user", content: answer }]);
    setAiTyping(true);
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/submit-answer/${sessionId}/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer }),
      });
      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`API error: ${errorData}`);
      }
      const data = await response.json();
      setAiTyping(false);
      if (data.follow_up_question) {
        setMessages(prev => [...prev, { type: "ai", content: data.follow_up_question }]);
      }
    } catch (error) {
      console.error("Error submitting answer:", error);
      setError(error.message);
      setAiTyping(false);
    } finally {
      setLoading(false);
    }
  };

  // Transition from Q&A to Coding: set step to "transition" so a transitional screen is shown.
  const handleSubmitTest = async () => {
    if (!sessionId) {
      setError("Session ID is missing.");
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/api/submit-test/${sessionId}/`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to submit test');
      }
      setStep("transition");
      window.history.pushState(null, null, window.location.href);
      window.addEventListener('popstate', () => {
        window.history.pushState(null, null, window.location.href);
      });
    } catch (error) {
      setError(error.message);
    }
  };

  // Coding Round: Handle language change & update templates.
  const handleLanguageChange = (lang) => {
    setCodingSubmissions(prev => {
      const newSubs = [...prev];
      const currentCode = newSubs[currentCodingIndex].code;
      const oldLang = newSubs[currentCodingIndex].language;
      newSubs[currentCodingIndex].language = lang;
      if (!currentCode.trim() || currentCode.trim() === baseTemplates[oldLang].trim()) {
        newSubs[currentCodingIndex].code = baseTemplates[lang];
      }
      return newSubs;
    });
  };

  // Helper: Map language to Ace Editor mode.
  const getEditorMode = (lang) => {
    if (lang === "cpp") return "c_cpp";
    return lang;
  };

  // Use a ref to track current code.
  const currentCodeRef = useRef('');
  const submitCurrentCode = async () => {
    if (!sessionId) {
      setError("Session ID is missing.");
      return;
    }
    const currentCode = currentCodeRef.current || "";
    if (!currentCode.trim()) {
      setError("Code cannot be empty.");
      return;
    }
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/submit-code/${sessionId}/`, {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: currentCode }),
      });
      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`API error: ${errorData}`);
      }
      const data = await response.json();
      setCodingFeedbacks(prev => {
        const newFeedbacks = [...prev];
        newFeedbacks[currentCodingIndex] = data;
        return newFeedbacks;
      });
      if (currentCodingIndex < codingQuestions.length - 1) {
        setCurrentCodingIndex(prev => prev + 1);
      } else {
        setStep("thankyou");
      }
    } catch (error) {
      console.error("Error submitting code:", error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const aggregateCodingFeedback = () => {
    let totalRating = 0;
    const count = codingQuestions.length;
    let combinedFeedback = "";
    codingFeedbacks.forEach((fb, idx) => {
      const rating = fb && fb.rating ? fb.rating : 0;
      totalRating += rating;
      const feedbackText = fb && fb.feedback ? fb.feedback : `No feedback for Question ${idx + 1}.`;
      combinedFeedback += `Question ${idx + 1}: ${feedbackText}\n`;
    });
    return { averageRating: (totalRating / count).toFixed(1), combinedFeedback };
  };

  const fadeIn = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
  };

  // Header: Timer at top-right and, in Q&A phase, the Proceed button directly below Timer.
  const Header = () => (
    <header className="bg-gradient-to-r from-gray-900 to-blue-900 text-white py-4 shadow-xl">
      <div className="max-w-5xl mx-auto px-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">AppWrk AI Interview Platform</h1>
        {sessionId && step !== "thankyou" && (
          <div className="flex flex-col items-end">
            <Timer 
              totalTime={3600}
              onTimeEnd={() => {
                if (step !== "coding") {
                  setStep("coding");
                } else {
                  submitCurrentCode();
                }
              }}
            />
            {step === "qa" && (
              <button
                onClick={handleSubmitTest}
                className="mt-2 px-4 py-2 bg-gray-800 hover:bg-gray-900 text-white rounded-lg font-medium transition-all"
              >
                Proceed to Coding Round →
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  );

  // File Upload Section
  const FileUploadSection = () => (
    <motion.div initial="hidden" animate="visible" variants={fadeIn} className="text-center">
      <h2 className="text-3xl font-bold mb-6 text-gray-800">Start Your AI-Powered Interview</h2>
      <input type="file" accept=".pdf" onChange={handleFileChange} className="hidden" id="resume-upload" />
      <label htmlFor="resume-upload" className="cursor-pointer group relative inline-block">
        <div className="border-2 border-dashed border-blue-200 p-8 rounded-2xl bg-white hover:border-blue-400 transition-all duration-300 group-hover:scale-105">
          <div className="flex flex-col items-center space-y-4">
            <div className="relative">
              <Upload className="h-16 w-16 text-blue-500" />
              <div className="absolute -right-2 -bottom-2 bg-white rounded-full p-1 shadow-lg">
                <FileText className="h-6 w-6 text-blue-400" />
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-xl font-semibold text-gray-800">Upload Your Resume</p>
              <p className="text-gray-500 text-sm">Supported format: PDF (max 5MB)</p>
            </div>
          </div>
        </div>
      </label>
      {file && (
        <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} className="mt-6 inline-flex items-center bg-green-100 px-4 py-2 rounded-lg">
          <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
          <span className="text-green-700 font-medium">{file.name}</span>
        </motion.div>
      )}
      <button
        onClick={createSession}
        disabled={!file || uploading}
        className="mt-8 px-12 py-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl font-semibold text-lg hover:shadow-lg transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {uploading ? <LoaderCircle className="animate-spin h-6 w-6 mx-auto" /> : 'Begin Interview →'}
      </button>
    </motion.div>
  );

  // Chat Message component (AI messages are left-aligned)
  const ChatMessage = ({ message, index }) => (
    <div className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`flex items-start max-w-2xl space-x-3 ${message.type === 'user' ? 'flex-row-reverse' : ''}`}>
        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${message.type === 'user' ? 'bg-blue-500' : 'bg-gray-600'}`}>
          {message.type === 'user' ? <User className="h-5 w-5 text-white" /> : <Bot className="h-5 w-5 text-white" />}
        </div>
        <div className={`p-4 rounded-2xl ${message.type === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-800'} shadow-sm`}>
          <p className="text-lg leading-relaxed text-left">{message.content}</p>
        </div>
      </div>
    </div>
  );

  // Coding Question Section wrapped in React.memo.
  const CodingQuestionSection = memo(() => (
    <div className="h-[800px] flex flex-col space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">
          Problem {currentCodingIndex + 1} of {codingQuestions.length}
        </h2>
        <div className="flex items-center space-x-4">
          <select
            value={codingSubmissions[currentCodingIndex].language}
            onChange={(e) => handleLanguageChange(e.target.value)}
            className="border border-gray-300 rounded-lg px-4 py-2 bg-white text-gray-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="python">Python</option>
            <option value="javascript">JavaScript</option>
            <option value="java">Java</option>
            <option value="cpp">C++</option>
          </select>
        </div>
      </div>
      <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 shadow-sm">
        <h3 className="text-xl font-semibold mb-4 text-gray-800">Problem Statement</h3>
        <div className="prose max-w-none">
          <pre className="whitespace-pre-wrap font-sans text-gray-700">
            {codingQuestions[currentCodingIndex]}
          </pre>
        </div>
      </div>
      <div className="flex-1 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <AceEditor
          key={`ace-${sessionId}-${currentCodingIndex}-${codingSubmissions[currentCodingIndex].language}`}
          mode={getEditorMode(codingSubmissions[currentCodingIndex].language)}
          theme="monokai"
          name={`codeEditor-${currentCodingIndex}`}
          defaultValue={codingSubmissions[currentCodingIndex].code}
          onLoad={(editor) => {
            editor.focus();
            currentCodeRef.current = editor.getValue();
          }}
          onChange={(newCode) => {
            currentCodeRef.current = newCode;
          }}
          fontSize={16}
          width="100%"
          height="1000px"
          setOptions={{
            enableBasicAutocompletion: true,
            enableLiveAutocompletion: true,
            enableSnippets: true,
            showLineNumbers: true,
            tabSize: 2,
          }}
          editorProps={{ $blockScrolling: true }}
          className="rounded-xl"
        />
      </div>
      <div className="flex justify-end space-x-4">
        {currentCodingIndex < codingQuestions.length - 1 ? (
          <button
            onClick={submitCurrentCode}
            disabled={loading}
            className="px-8 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-all transform hover:scale-105 disabled:opacity-50"
          >
            {loading ? <LoaderCircle className="animate-spin h-5 w-5" /> : `Submit`}
          </button>
        ) : (
          <button
            onClick={submitCurrentCode}
            disabled={loading}
            className="px-8 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-all transform hover:scale-105 disabled:opacity-50"
          >
            {loading ? <LoaderCircle className="animate-spin h-5 w-5" /> : 'Complete Test'}
          </button>
        )}
      </div>
    </div>
  ));

  // Transition screen: displays while moving to coding phase.
  const TransitionScreen = () => (
    <div className="flex flex-col items-center justify-center h-[850px]">
      <p className="text-3xl font-bold mb-4">Coding Round...</p>
      <LoaderCircle className="animate-spin h-10 w-10" />
    </div>
  );

  const ThankYouPage = () => {
    const { averageRating, combinedFeedback } = aggregateCodingFeedback();
    return (
      <div className="text-center p-10">
        <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold mb-4">Thank you for completing the test!</h2>
        <div className="mb-4">
          {/* <p className="text-lg text-gray-800">Your Final Coding Feedback:</p>
          <p className="text-gray-700 whitespace-pre-line">{combinedFeedback}</p>
          <p className="text-gray-700">Average Rating: {averageRating} / 10</p> */}
        </div>
        <p className="text-gray-600">Our HR team will get back to you shortly.</p>
      </div>
    );
  };

  // const aggregateCodingFeedback = () => {
  //   let totalRating = 0;
  //   const count = codingQuestions.length;
  //   let combinedFeedback = "";
  //   codingFeedbacks.forEach((fb, idx) => {
  //     const rating = fb && fb.rating ? fb.rating : 0;
  //     totalRating += rating;
  //     const feedbackText = fb && fb.feedback ? fb.feedback : `No feedback for Question ${idx + 1}.`;
  //     combinedFeedback += `Question ${idx + 1}: ${feedbackText}\n`;
  //   });
  //   return { averageRating: (totalRating / count).toFixed(1), combinedFeedback };
  // };

  // const fadeIn = {
  //   hidden: { opacity: 0, y: 20 },
  //   visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
  // };

  return (
    <div className="min-h-screen w-full bg-gray-50">
      <Header />
      <main className="max-w-5xl mx-auto px-6 py-8">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="bg-white rounded-2xl shadow-xl p-8"
        >
          {!sessionId ? (
            <FileUploadSection />
          ) : step === "qa" ? (
            <div className="relative h-[850px]">
              <div className="overflow-y-auto h-full pb-24">
                {messages.map((message, index) => (
                  <ChatMessage key={index} message={message} index={index} />
                ))}
                {aiTyping && (
                  <div className="flex justify-start mb-4">
                    <div className="p-4 rounded-2xl bg-gray-100 text-gray-800 shadow-sm text-left">
                      <p className="text-lg leading-relaxed flex items-center">
                        <LoaderCircle className="animate-spin h-5 w-5 mr-2" /> The Next Question...
                      </p>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              <div className="absolute bottom-0 left-0 right-0 border-t bg-white p-4 flex items-center">
                <input
                  type="text"
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  placeholder="Type your answer here..."
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
                  onKeyPress={(e) => e.key === 'Enter' && submitAnswer()}
                />
              </div>
            </div>
          ) : step === "transition" ? (
            <TransitionScreen />
          ) : step === "coding" ? (
            <CodingQuestionSection />
          ) : (
            <ThankYouPage />
          )}
        </motion.div>
      </main>
    </div>
  );
};

export default Dashboard;
