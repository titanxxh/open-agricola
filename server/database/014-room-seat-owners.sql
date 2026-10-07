-- A seat has one owner; a development account may own several seats.
ALTER TABLE room_players DROP CONSTRAINT room_players_pkey;
ALTER TABLE room_players ADD PRIMARY KEY (room_id, player_index);
CREATE INDEX room_players_user_seats ON room_players (user_id, room_id, player_index);
