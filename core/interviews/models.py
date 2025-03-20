import uuid
from django.db import models

class InterviewSession(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    resume = models.FileField(upload_to='resumes/')
    parsed_data = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    is_completed = models.BooleanField(default=False)
    status = models.CharField(max_length=20, default='in_progress')
    completed_at = models.DateTimeField(null=True, blank=True)
    final_feedback = models.JSONField(null=True, blank=True)
    final_coding_feedback = models.JSONField(null=True, blank=True) 
    STATUS_CHOICES = [
        ('in_progress', 'In Progress'),
        ('coding_round', 'Coding Round'),
        ('completed', 'Completed'),
    ]
    status = models.CharField(
        max_length=20, 
        choices=STATUS_CHOICES, 
        default='in_progress'
    )

    def __str__(self):
        return f"Session {self.id}"

class Question(models.Model):
    session = models.ForeignKey(InterviewSession, on_delete=models.CASCADE)
    text = models.TextField()
    answer = models.TextField(blank=True)
    rating = models.FloatField(null=True)
    feedback = models.TextField(blank=True)

    def __str__(self):
        return self.text[:50]