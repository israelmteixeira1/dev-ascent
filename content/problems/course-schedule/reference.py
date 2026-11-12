from collections import deque


def can_finish(num_courses, prerequisites):
    needs = [0] * num_courses
    unlocks = [[] for _ in range(num_courses)]
    for course, before in prerequisites:
        needs[course] += 1
        unlocks[before].append(course)
    ready = deque(c for c in range(num_courses) if needs[c] == 0)
    taken = 0
    while ready:
        course = ready.popleft()
        taken += 1
        for nxt in unlocks[course]:
            needs[nxt] -= 1
            if needs[nxt] == 0:
                ready.append(nxt)
    return taken == num_courses
