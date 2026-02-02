const { GoogleGenerativeAI } = require("@google/generative-ai");

if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY missing");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const model = genAI.getGenerativeModel({
  model: "models/gemini-2.5-flash",
});

exports.askGemini = async (message) => {
  const result = await model.generateContent(message);
  return result.response.text();
};