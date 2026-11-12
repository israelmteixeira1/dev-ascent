from collections import Counter


def top_k_frequent(nums, k):
    return [value for value, _ in Counter(nums).most_common(k)]
