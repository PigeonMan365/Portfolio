from flask import render_template, request
from app import app
import ollama

# Function to get AI response
def get_ai_response(prompt):
    response = ollama.generate(model="llama3.2:1b", prompt=prompt)
    return response.response.strip()

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/analyze', methods=['POST'])
def analyze():
    text = request.form['text']
    analysis_type = request.form['analysis_type']

    if analysis_type == 'sentiment':
        # Sentiment Analysis
        sentiment_prompt = f"Analyze the sentiment of the following text: {text}"
        sentiment = get_ai_response(sentiment_prompt)
        return render_template('result.html', sentiment=sentiment, summary=None)

    elif analysis_type == 'summarization':
        # Text Summarization
        summary_prompt = f"Summarize the following text: {text}"
        summary = get_ai_response(summary_prompt)
        return render_template('result.html', sentiment=None, summary=summary)

    elif analysis_type == 'both':
        # Both Sentiment Analysis and Text Summarization
        sentiment_prompt = f"Analyze the sentiment of the following text: {text}"
        sentiment = get_ai_response(sentiment_prompt)
        summary_prompt = f"Summarize the following text: {text}"
        summary = get_ai_response(summary_prompt)
        return render_template('result.html', sentiment=sentiment, summary=summary)

    return render_template('result.html', sentiment=None, summary=None)
