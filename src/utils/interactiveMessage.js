export const hasImageNativeActions = (data = {}) => {
  return (
    Boolean(data.image?.url) &&
    Array.isArray(data.buttons) &&
    data.buttons.some((button) => button.name !== "quick_reply")
  );
};

export const normalizeInteractiveImageHeader = (message) => {
  const header = message?.interactiveMessage?.header;
  if (!header?.imageMessage) {
    throw new Error("Cabeçalho de imagem interativo ausente");
  }

  // The caption belongs to the interactive body. Keeping another caption,
  // title or subtitle in the media header makes current clients reject the
  // otherwise valid native-flow message as unsupported content.
  delete header.imageMessage.caption;
  delete header.title;
  delete header.subtitle;

  return message;
};
