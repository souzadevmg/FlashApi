import assert from "node:assert/strict";
import test from "node:test";

import {
  hasImageNativeActions,
  normalizeInteractiveImageHeader,
} from "../src/utils/interactiveMessage.js";

const buttons = [
  {
    name: "quick_reply",
    buttonParamsJson: { display_text: "Suporte", id: "support" },
  },
  {
    name: "cta_copy",
    buttonParamsJson: JSON.stringify({
      display_text: "Copiar",
      copy_code: "123",
    }),
  },
  {
    name: "cta_url",
    buttonParamsJson: { display_text: "Abrir", url: "https://example.com" },
  },
];

test("detecta imagem combinada com ações nativas", () => {
  assert.equal(
    hasImageNativeActions({ image: { url: "image.jpg" }, buttons }),
    true,
  );
  assert.equal(
    hasImageNativeActions({
      image: { url: "image.jpg" },
      buttons: [buttons[0]],
    }),
    false,
  );
  assert.equal(hasImageNativeActions({ buttons }), false);
});

test("normaliza somente o cabeçalho e preserva mídia, corpo e ações", () => {
  const message = {
    interactiveMessage: {
      header: {
        title: "Título concorrente",
        subtitle: "Subtítulo concorrente",
        hasMediaAttachment: true,
        imageMessage: {
          caption: "Legenda duplicada",
          mediaKey: "fixture",
          width: 800,
          height: 800,
        },
      },
      body: { text: "Bem-vindo" },
      footer: { text: "Rodapé" },
      nativeFlowMessage: { buttons },
    },
  };

  const normalized = normalizeInteractiveImageHeader(message);

  assert.deepEqual(Object.keys(normalized.interactiveMessage.header).sort(), [
    "hasMediaAttachment",
    "imageMessage",
  ]);
  assert.equal(
    normalized.interactiveMessage.header.imageMessage.caption,
    undefined,
  );
  assert.equal(
    normalized.interactiveMessage.header.imageMessage.mediaKey,
    "fixture",
  );
  assert.equal(normalized.interactiveMessage.body.text, "Bem-vindo");
  assert.equal(
    normalized.interactiveMessage.nativeFlowMessage.buttons.length,
    3,
  );
});

test("rejeita a normalização sem uma imagem preparada", () => {
  assert.throws(
    () => normalizeInteractiveImageHeader({}),
    /Cabeçalho de imagem interativo ausente/,
  );
});
