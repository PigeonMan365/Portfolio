from flask import Flask, request, jsonify
import llama

app = Flask(__name__)

@app.route('/summarize', methods=['POST'])
def summarize():
    data = request.json
    analysis_results = data['analysis']
    summaries = []
    for filename, analysis in analysis_results:
        if filename.endswith('.py'):
            summary = llama.summarize_python(analysis)
        elif filename.endswith('.js'):
            summary = llama.summarize_javascript(analysis)
        elif filename.endswith('.java'):
            summary = llama.summarize_java(analysis)
        summaries.append((filename, summary))
    return jsonify({'summary': summaries})

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=5002)
