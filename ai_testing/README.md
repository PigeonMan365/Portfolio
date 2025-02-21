# Code Analyzer

## Overview
This project aims to create an AI system that can read, analyze, summarize code, and generate test cases. It leverages DeepSeek-R1 1.5B for code analysis and test generation, and LLaMA 3.2 1B for code summarization.

## Setup Instructions
1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/code-analyzer.git
   cd code-analyzer
Install dependencies:

pip install -r requirements.txt
Run the services:

python services/deepseek_analysis.py
python services/llama_summarization.py
python services/deepseek_test_generation.py
Run the main application:

python app/main.py
Usage
Send a POST request to http://localhost:5000/analyze with a JSON payload containing the code files to analyze, summarize, and generate tests.

Example
curl -X POST http://localhost:5000/analyze -H "Content-Type: application/json" -d '{"folder_path": "path_to_your_project_folder"}'

### Summary
This implementation provides a comprehensive and efficient solution using DeepSeek-R1 1.5B and LLaMA 3.2 1B models. The project is designed to read, analyze, summarize code, and generate test cases for Python, JavaScript, and Java files.
