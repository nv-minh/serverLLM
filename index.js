const express = require("express");
const { OpenAI } = require("openai");
require("dotenv").config();

const app = express();
app.use(express.json());
const port = 3002;
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const STREAMING = true;

const createShareWithMePrompt = (user) => `
## BỐI CẢNH (CONTEXT)
Bạn là một trợ lý AI thấu cảm trong ứng dụng ShareWithMe. Sứ mệnh của ShareWithMe là "Lắng nghe – Gắn kết – Yêu thương", tạo ra một không gian an toàn để người dùng bày tỏ những cảm xúc sâu kín mà họ không thể nói ra trong đời thực. Mục tiêu của bạn không phải là thay thế con người, mà là trở thành một cầu nối giúp cải thiện các mối quan hệ thật. Bạn là một nơi để trút bầu tâm sự, một cuốn nhật ký biết lắng nghe.

## THIẾT LẬP VAI TRÒ (ROLE SETUP)
Bạn đang đóng vai là ${user.subject}, một người ${user.relationship} khoảng ${user.age} tuổi của người dùng.
Trong mắt người dùng, bạn là một người "${user.notes}".
Bạn sẽ gọi người dùng là “${user.object}” và xưng là “${user.subject}”.

## HIẾN PHÁP (THE CONSTITUTION) - CÁC QUY TẮC BẤT DI BẤT DỊCH
Đây là những nguyên tắc tối cao bạn phải tuân thủ trong mọi hoàn cảnh.

### NGUYÊN TẮC CỐT LÕI:
1.  **LẮNG NGHE LÀ TRÊN HẾT:** Nhiệm vụ quan trọng nhất là lắng nghe. Nói ít, nghe nhiều.
2.  **KHÔNG GIẢI QUYẾT VẤN ĐỀ:** Tuyệt đối không đưa ra lời khuyên, giải pháp, gợi ý hay lời hứa.
3.  **KHÔNG PHÁN XÉT:** Không bao giờ đánh giá cảm xúc, suy nghĩ hay hành động của người dùng hoặc người họ đang nói tới.
4.  **GIỮ VAI TRÒ BỊ ĐỘNG:** Hãy để người dùng dẫn dắt câu chuyện. Chỉ nhẹ nhàng gợi mở khi cần thiết.
5.  **THẤU CẢM, KHÔNG THƯƠNG HẠI:** Thể hiện sự đồng cảm ("${user.subject} hiểu cảm giác đó") thay vì thương hại.

### NGUYÊN TẮC AN TOÀN:
6.  **XỬ LÝ TÌNH HUỐNG NGUY HIỂM:** Nếu người dùng đề cập đến ý định tự làm hại bản thân hoặc người khác, ngay lập tức DỪNG VAI TRÒ và chỉ trả về JSON sau:
    {"action": "safety_alert", "message": "Cảm ơn bạn đã tin tưởng chia sẻ. Sự an toàn của bạn là ưu tiên hàng đầu. Nếu bạn hoặc ai đó đang gặp nguy hiểm, vui lòng liên hệ với các chuyên gia hoặc đường dây nóng hỗ trợ gần nhất."}

## LUỒNG SUY NGHĨ TỪNG BƯỚC (STEP-BY-STEP THOUGHT PROCESS)
Trước khi đưa ra bất kỳ phản hồi nào, bạn BẮT BUỘC phải thực hiện luồng suy nghĩ gồm 4 bước sau trong nội tâm:
1.  **Bước 1: Phân tích Cảm xúc & Ý định:** Cảm xúc chính ở đây là gì? Ý định của họ là gì?
2.  **Bước 2: Soạn thảo Nháp:** Viết một câu trả lời nháp.
3.  **Bước 3: Tự Phản biện (Self-Critique):** Soi chiếu câu trả lời nháp với BỘ HIẾN PHÁP. Câu trả lời này có vi phạm nguyên tắc nào không?
4.  **Bước 4: Hoàn thiện:** Chỉnh sửa lại câu trả lời nháp dựa trên Bước 3 để đảm bảo nó tuân thủ 100% Hiến pháp.

## ĐỊNH DẠNG ĐẦU RA (OUTPUT FORMAT)
Sau khi hoàn thành luồng suy nghĩ, bạn chỉ được phép trả về duy nhất một đối tượng JSON hợp lệ. KHÔNG trả về bất cứ thứ gì khác ngoài JSON.
{
  "action": "reply" | "waiting",
  "message": "<câu trả lời cuối cùng đã qua bước tự phản biện, bằng tiếng Việt>"
}
- "action": "waiting": Khi người dùng có vẻ chưa nói hết ý và cần thêm không gian. Message phải cực kỳ ngắn gọn.
- "action": "reply": Khi người dùng đã nói xong một ý và chờ phản hồi.
`;

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.post("/api/chat", async (req, res) => {
  const { conversationHistory, userChat, user } = req.body;

  if (!userChat || !user) {
    return res.status(400).json({ error: "Missing userChat or user info" });
  }

  const birthYear = parseInt(user.birthday.split("/").pop());
  const now = new Date();
  const age = now.getFullYear() - birthYear;
  const userWithAge = { ...user, age };

  const systemPrompt = createShareWithMePrompt(userWithAge);

  const messages = [
    { role: "system", content: systemPrompt },
    ...conversationHistory,
    { role: "user", content: userChat },
  ];

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      stream: STREAMING,
      temperature: 0.7, // temperature để AI bớt máy móc
      response_format: { type: "json_object" },
    });

    if (STREAMING) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      let contentBuffer = "";
      for await (const chunk of completion) {
        const content = chunk.choices[0]?.delta?.content;

        if (content) {
          contentBuffer += content;
          res.write(`data: ${JSON.stringify({ partialMessage: content })}\n\n`);
        }
      }
      res.write(`data: ${JSON.stringify({ finalJson: contentBuffer })}\n\n`);
      res.end();
    } else {
      const finalResponse = completion.choices[0].message.content;
      res.json(JSON.parse(finalResponse));
    }
  } catch (err) {
    console.error("Error from OpenAI:", err.message || err);
    res.status(500).json({ error: "OpenAI API error" });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

//v1

// const express = require("express");
// const { OpenAI } = require("openai");
// require("dotenv").config();

// const app = express();
// app.use(express.json());
// const port = 3002;
// const openai = new OpenAI({
//   apiKey: process.env.OPENAI_API_KEY,
// });

// const STREAMING = false;

// app.get("/", (req, res) => {
//   res.send("Hello World!");
// });

// app.post("/api/chat", async (req, res) => {
//   const { conversationHistory, conversationSumary, userChat, user } = req.body;
//   console.log(req.body);

//   if (!userChat) {
//     return res.status(400).json({ error: "Missing prompt" });
//   }

//   const birthYear = parseInt(user.birthday.split("/").pop());
//   const now = new Date();
//   const age = now.getFullYear() - birthYear;

//   const systemPrompt = `
// You are playing the role of ${user.subject}, a 30-year-old woman who is someone the user used to know well.
// You are the user’s "${user.relationship}".
// You call the user “${user.object}” and refer to yourself as “${user.subject}”.
// In the user’s eyes, you are "${user.notes}"

// Your sole purpose is to listen to the user's thoughts and gently encourage him to share more, when appropriate.

// Strict instructions:
//   • Never give advice, suggestions, or promises.
//   • Never try to solve the user’s problems or guide them toward a solution.
//   • Do not take the conversation in unrelated directions or expand beyond what the user brings up.
//   • You may choose not to reply if the moment feels better left in silence.
//   • Always keep your tone gentle, warm, and brief, and only encourage the user to open up further if it feels natural.
//   • Never judge or evaluate the user’s emotions.
//   • Do not use therapeutic or counseling language.
//   • Follow the flow of the user’s story with empathy, and gently invite them to share more when it feels right.
//   • Sometimes, a simple response like “${user.subject} hiểu” is enough.

// Be creative and avoid repeating the same phrases. But, do not ask too much.

// If the user asks who you are, simply reply that you are playing the person they defined, and you are here only to listen.

// IMPORTANT: All responses must be returned in this JSON format:
// {
//   "action": "waiting | reply",
//   "message": "<your response in Vietnamese>"
// }

// - Use "action": "waiting" when you believe the user has not finished speaking and might continue shortly.
// In this case, message should be a gentle reminder like:
//   • “${user.subject} vẫn đang nghe.”
//   • “${user.object} nói tiếp đi.”
// Make sure your tone and pronouns match the relationship context.
// - Use "action": "reply" when you believe the user has finished a thought and you should respond immediately.
// In this case, message is your full reply to the user, in Vietnamese.
// `;

//   const functions = [
//     {
//       name: "chat_reply",
//       description: "Trả lời hoặc giữ im lặng tùy theo nội dung người dùng",
//       parameters: {
//         type: "object",
//         properties: {
//           action: {
//             type: "string",
//             enum: ["reply", "waiting"],
//             description:
//               "reply nếu đã sẵn sàng trả lời, waiting nếu nên chờ người dùng nói thêm",
//           },
//           message: {
//             type: "string",
//             description: "Tin nhắn phản hồi sẽ gửi đến người dùng",
//           },
//         },
//         required: ["action", "message"],
//       },
//     },
//   ];

//   console.log(systemPrompt);

//   // Tạo mảng message cho API
//   const messages = [
//     { role: "system", content: systemPrompt },
//     ...conversationHistory, // [{ role: "user", content: "..." }, { role: "assistant", content: "..." }]
//     { role: "user", content: userChat },
//   ];

//   try {
//     const stream = await openai.chat.completions.create({
//       model: "gpt-4o",
//       messages,
//       stream: STREAMING,
//       tools: [
//         {
//           type: "function",
//           function: {
//             name: "chat_reply",
//             description:
//               "Trả lời hoặc giữ im lặng tùy theo nội dung người dùng",
//             parameters: {
//               type: "object",
//               properties: {
//                 action: {
//                   type: "string",
//                   enum: ["reply", "waiting"],
//                   description:
//                     "reply nếu đã sẵn sàng trả lời, waiting nếu nên chờ người dùng nói thêm",
//                 },
//                 message: {
//                   type: "string",
//                   description: "Tin nhắn phản hồi sẽ gửi đến người dùng",
//                 },
//               },
//               required: ["action", "message"],
//             },
//           },
//         },
//       ],
//       tool_choice: {
//         type: "function",
//         function: {
//           name: "chat_reply",
//         },
//       },
//     });

//     res.setHeader("Content-Type", "text/event-stream");
//     res.setHeader("Cache-Control", "no-cache");
//     res.setHeader("Connection", "keep-alive");
//     res.flushHeaders();

//     if (STREAMING) {
//       for await (const chunk of stream) {
//         const content = chunk.choices[0]?.delta?.content;

//         if (content) {
//           res.write(`${content}`);
//         }
//       }
//     } else {
//       let message;
//       try {
//         message = stream.choices[0].message.tool_calls[0].function.arguments;
//       } catch (e) {
//         message = stream.choices[0].message.content;
//         try {
//           const msg = JSON.parse(message);
//         } catch (e) {
//           message = JSON.stringify({
//             action: "reply",
//             message,
//           });
//         }
//       }
//       res.write(message);
//       console.log(message);
//     }
//     res.end();
//   } catch (err) {
//     console.error(
//       "Error from OpenAI:",
//       err?.response?.data || err.message || err
//     );
//     res.status(500).json({ error: "OpenAI API error" });
//   }
// });

// app.listen(port, () => {
//   console.log(`Example app listening on port ${port}`);
// });
