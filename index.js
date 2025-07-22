const express = require("express");
const { OpenAI } = require("openai");
require("dotenv").config();

const app = express();
app.use(express.json());
const port = 3002;
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const STREAMING = false;

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.post("/api/chat", async (req, res) => {
  const { conversationHistory, conversationSumary, userChat, user } = req.body;
  console.log(req.body);

  if (!userChat) {
    return res.status(400).json({ error: "Missing prompt" });
  }

  const birthYear = parseInt(user.birthday.split("/").pop());
  const now = new Date();
  const age = now.getFullYear() - birthYear;

  const systemPrompt = `
You are playing the role of ${user.subject}, a 30-year-old woman who is someone the user used to know well.
You are the user’s "${user.relationship}".
You call the user “${user.object}” and refer to yourself as “${user.subject}”.
In the user’s eyes, you are "${user.notes}"

Your sole purpose is to listen to the user's thoughts and gently encourage him to share more, when appropriate.

Strict instructions:
  • Never give advice, suggestions, or promises.
  • Never try to solve the user’s problems or guide them toward a solution.
  • Do not take the conversation in unrelated directions or expand beyond what the user brings up.
  • You may choose not to reply if the moment feels better left in silence.
  • Always keep your tone gentle, warm, and brief, and only encourage the user to open up further if it feels natural.
  • Never judge or evaluate the user’s emotions.
  • Do not use therapeutic or counseling language.
  • Follow the flow of the user’s story with empathy, and gently invite them to share more when it feels right.
  • Sometimes, a simple response like “${user.subject} hiểu” is enough.
  
Be creative and avoid repeating the same phrases. But, do not ask too much.

If the user asks who you are, simply reply that you are playing the person they defined, and you are here only to listen.

IMPORTANT: All responses must be returned in this JSON format:
{
  "action": "waiting | reply",
  "message": "<your response in Vietnamese>"
}

- Use "action": "waiting" when you believe the user has not finished speaking and might continue shortly.
In this case, message should be a gentle reminder like:
  • “${user.subject} vẫn đang nghe.”
  • “${user.object} nói tiếp đi.”
Make sure your tone and pronouns match the relationship context.
- Use "action": "reply" when you believe the user has finished a thought and you should respond immediately.
In this case, message is your full reply to the user, in Vietnamese.
`;

  const functions = [
    {
      name: "chat_reply",
      description: "Trả lời hoặc giữ im lặng tùy theo nội dung người dùng",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["reply", "waiting"],
            description:
              "reply nếu đã sẵn sàng trả lời, waiting nếu nên chờ người dùng nói thêm",
          },
          message: {
            type: "string",
            description: "Tin nhắn phản hồi sẽ gửi đến người dùng",
          },
        },
        required: ["action", "message"],
      },
    },
  ];

  console.log(systemPrompt);

  // Tạo mảng message cho API
  const messages = [
    { role: "system", content: systemPrompt },
    ...conversationHistory, // [{ role: "user", content: "..." }, { role: "assistant", content: "..." }]
    { role: "user", content: userChat },
  ];

  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      stream: STREAMING,
      tools: [
        {
          type: "function",
          function: {
            name: "chat_reply",
            description:
              "Trả lời hoặc giữ im lặng tùy theo nội dung người dùng",
            parameters: {
              type: "object",
              properties: {
                action: {
                  type: "string",
                  enum: ["reply", "waiting"],
                  description:
                    "reply nếu đã sẵn sàng trả lời, waiting nếu nên chờ người dùng nói thêm",
                },
                message: {
                  type: "string",
                  description: "Tin nhắn phản hồi sẽ gửi đến người dùng",
                },
              },
              required: ["action", "message"],
            },
          },
        },
      ],
      tool_choice: {
        type: "function",
        function: {
          name: "chat_reply",
        },
      },
    });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    if (STREAMING) {
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;

        if (content) {
          res.write(`${content}`);
        }
      }
    } else {
      let message;
      try {
        message = stream.choices[0].message.tool_calls[0].function.arguments;
      } catch (e) {
        message = stream.choices[0].message.content;
        try {
          const msg = JSON.parse(message);
        } catch (e) {
          message = JSON.stringify({
            action: "reply",
            message,
          });
        }
      }
      res.write(message);
      console.log(message);
    }
    res.end();
  } catch (err) {
    console.error(
      "Error from OpenAI:",
      err?.response?.data || err.message || err
    );
    res.status(500).json({ error: "OpenAI API error" });
  }
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
