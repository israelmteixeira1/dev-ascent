def reverse_list(head):
    previous = None
    while head:
        head.next, previous, head = previous, head, head.next
    return previous
