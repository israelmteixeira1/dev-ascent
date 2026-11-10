-- Runs once, when the local volume is created: a separate database for the database tests,
-- which truncate tables and must never touch the development data.
CREATE DATABASE devascent_test;
