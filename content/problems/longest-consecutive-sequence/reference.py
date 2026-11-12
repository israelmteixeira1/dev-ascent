def longest_consecutive(nums):
    values = set(nums)
    best = 0
    for v in values:
        if v - 1 in values:
            continue
        length = 1
        while v + length in values:
            length += 1
        best = max(best, length)
    return best
