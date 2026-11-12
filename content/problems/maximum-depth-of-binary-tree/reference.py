def max_depth(root):
    depth, level = 0, [root] if root else []
    while level:
        depth += 1
        level = [child for node in level for child in (node.left, node.right) if child]
    return depth
