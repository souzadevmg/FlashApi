import express from "express";
import authenticateApiKey from "../middleware/auth.js";
import BaileysService from "../services/BaileysService.js";
import Store from "../models/Store.js";
import logger from "../utils/logger.js";
import config from "../config/env.js";
import Session from "../models/Session.js";
import axios from "axios";

const router = express.Router();

// Página de login (GET)
router.get("/login", (req, res) => {
  const error = req.session.error;
  delete req.session.error;
  res.render("index", { error });
});

// Rota para processar o login (POST)
router.post("/login", async (req, res) => {
  const { apikey = null } = req.body;

  let modo = null;
  if (config.globalApiKey === apikey) {
    modo = "admin";
    req.session.userId = apikey;
    req.session.modo = modo;
    return res.redirect("/manager/dashboard");
  } else {
    const getsession = await Session.findById(apikey);
    if (!getsession) {
      req.session.error = { message: "Apikey invalido.", icon: "danger" };
      return res.redirect("/manager/login");
    }
    modo = "user";
    req.session.userId = apikey;
    req.session.modo = modo;
    return res.redirect("/manager/dashboard");
  }
});

// Página protegida - só acessa se estiver logado
router.get("/dashboard", checkAuth, async (req, res) => {
  const userId = req.session.userId;
  const modo = req.session.modo;
  if (modo == "admin") {
    const instances = await Session.findByApiKey();
    // Enrich with profile picture from Redis
    for (const inst of instances) {
      try {
        const cached = await BaileysService.redis.get(`sessao:${inst.id}`);
        inst.url_imagem = cached?.url_imagem || null;
      } catch { inst.url_imagem = null; }
    }
    res.render("dashboard", { instances, userId, error: null });
  } else if (modo == "user") {
    const getintacias = await Session.findByApiKey();
    const instances = getintacias.filter((i) => i.apikey == userId);

    if (!instances) {
      req.session.error = { message: "Apikey invalida.", icon: "danger" };
      res.redirect("/manager/login");
      return;
    }

    // Enrich with profile picture from Redis
    for (const inst of instances) {
      try {
        const cached = await BaileysService.redis.get(`sessao:${inst.id}`);
        inst.url_imagem = cached?.url_imagem || null;
      } catch { inst.url_imagem = null; }
    }

    res.render("user", { instances, userId, error: null });
  }
});

// Logout
router.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.redirect("/dashboard");
    }
    res.clearCookie("connect.sid");
    res.redirect("/manager/login");
  });
});

//Verificar se ta logado
function checkAuth(req, res, next) {
  if (req.session && req.session.userId && req.session.modo) {
    next();
  } else {
    req.session.error = {
      message: "Você precisa estar logado para acessar essa página.",
      icon: "danger",
    };
    res.redirect("/manager/login");
  }
}
export default router;
