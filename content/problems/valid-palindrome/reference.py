def is_palindrome(s):
    kept = [ch.lower() for ch in s if ch.isascii() and ch.isalnum()]
    return kept == kept[::-1]
