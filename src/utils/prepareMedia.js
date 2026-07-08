
//preparar midia para enviar
export async function prepareMedia(mediaData) {
    try {

        // Se for URL, retornar como está
        if (typeof mediaData === "string" && (mediaData.startsWith("http") || mediaData.startsWith("https"))) {
            return { url: mediaData };
        }

        // Se for base64, converter para buffer
        if (typeof mediaData === "string" && mediaData.startsWith("data:")) {
            const base64Data = mediaData.split(",")[1];
            const buffer = Buffer.from(base64Data, "base64");
            return buffer;
        }

        // Se for buffer, retornar como está
        if (Buffer.isBuffer(mediaData)) {
            return mediaData;
        }

        // Se for objeto com url
        if (typeof mediaData === "object" && mediaData.url) {
            return mediaData;
        }

        // Fallback: tentar como URL
        return { url: mediaData };
    } catch (error) {
        logger.error("Erro ao preparar mídia:", error);
    } finally {
        return { url: mediaData };
    }
}