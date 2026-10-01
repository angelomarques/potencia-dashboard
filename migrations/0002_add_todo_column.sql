-- Migration: Add "To do" column between Backlog and In Progress
-- Board: board_lawa

-- Shift positions of subsequent columns: Done (3 -> 4), Review (2 -> 3), In Progress (1 -> 2)
UPDATE columns SET position = 4 WHERE id = 'col_lawa_done' AND board_id = 'board_lawa';
UPDATE columns SET position = 3 WHERE id = 'col_lawa_review' AND board_id = 'board_lawa';
UPDATE columns SET position = 2 WHERE id = 'col_lawa_progress' AND board_id = 'board_lawa';

-- Insert the new "To do" column at position 1
INSERT OR IGNORE INTO columns (id, board_id, name, position, color, created_at)
VALUES ('col_lawa_todo', 'board_lawa', 'To do', 1, '#6366f1', unixepoch() * 1000);
