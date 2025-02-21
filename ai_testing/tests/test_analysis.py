import unittest
from app.analysis import analyze_code

class TestAnalysis(unittest.TestCase):
    def test_analyze_code(self):
        files = [("test.py", "def foo():\n    return 'bar'")]
        analysis = analyze_code(files)
        self.assertIsNotNone(analysis)

if __name__ == '__main__':
    unittest.main()
