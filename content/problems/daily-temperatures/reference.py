def daily_temperatures(temperatures):
    answer = [0] * len(temperatures)
    waiting = []
    for day, temp in enumerate(temperatures):
        while waiting and temperatures[waiting[-1]] < temp:
            earlier = waiting.pop()
            answer[earlier] = day - earlier
        waiting.append(day)
    return answer
