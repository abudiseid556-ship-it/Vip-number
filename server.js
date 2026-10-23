"use strict";

require("dotenv").config();

const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const { Telegraf } = require("telegraf");
const crypto = require("crypto");

const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;
const BACKEND_URL =
  process.env.BACKEND_URL || "https://skyway-travel.onrender.com";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      })
    : null;

const bot = TELEGRAM_BOT_TOKEN
  ? new Telegraf(TELEGRAM_BOT_TOKEN)
  : null
