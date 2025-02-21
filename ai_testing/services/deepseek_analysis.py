from flask import Flask, request, jsonify
import deepseek

app = Flask(__name__)

@app.route('/analyze', methods=['POST'])
def analyze():
    data = request.json
    files = data['files']
    analysis_results = []
    for filename, file_content in files:
        if filename.endswith('.py'):
            analysis = deepseek.analyze_python(file_content)
        elif filename.endswith('.js'):
            analysis = deepseek.analyze_javascript(file_content)
        elif filename.endswith('.java'):
            analysis = deepseek.analyze_java(file_content)
        analysis_results.append((filename, analysis))
    return jsonify({'analysis': analysis_results})

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=5001)
