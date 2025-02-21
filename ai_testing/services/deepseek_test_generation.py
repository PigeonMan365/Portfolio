from flask import Flask, request, jsonify
import deepseek

app = Flask(__name__)

@app.route('/generate_tests', methods=['POST'])
def generate_tests():
    data = request.json
    summaries = data['summary']
    test_cases = []
    for filename, summary in summaries:
        if filename.endswith('.py'):
            tests = deepseek.generate_tests_python(summary)
        elif filename.endswith('.js'):
            tests = deepseek.generate_tests_javascript(summary)
        elif filename.endswith('.java'):
            tests = deepseek.generate_tests_java(summary)
        test_cases.append((filename, tests))
    return jsonify({'tests': test_cases})

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=5003)
