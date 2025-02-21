import unittest
from app.summarization import summarize_code

class TestSummarization(unittest.TestCase):
    def test_summarize_code(self):
        analysis = [("test.py", {"functions": ["foo"]})]
        summary = summarize_code(analysis)
        self.assertIsNotNone(summary)

if __name__ == '__main__':
    unittest.main()
