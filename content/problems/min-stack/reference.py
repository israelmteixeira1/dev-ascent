class MinStack:
    def __init__(self):
        self.items = []

    def push(self, val):
        low = min(val, self.items[-1][1]) if self.items else val
        self.items.append((val, low))

    def pop(self):
        self.items.pop()

    def top(self):
        return self.items[-1][0]

    def getMin(self):
        return self.items[-1][1]
