from flask import Flask, request, jsonify
import requests
from .utils import read_project

app = Flask(__name__)

@app.route('/analyze', methods=['POST'])
def analyze():
    data = request.json
    folder_path = data['folder_path']

    # Read project files
    files = read_project(folder_path)

    # Analyze code with DeepSeek
    analysis_response = requests.post('http://localhost:5001/analyze', json={'files': files})
    analysis = analysis_response.json()['analysis']

    # Summarize code with LLaMA
    summary_response = requests.post('http://localhost:5002/summarize', json={'analysis': analysis})
    summary = summary_response.json()['summary']

    # Generate tests with DeepSeek
    tests_response = requests.post('http://localhost:5003/generate_tests', json={'summary': summary})
    tests = tests_response.json()['tests']

    return jsonify({'summary': summary, 'tests': tests})

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=5000)
