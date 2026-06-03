const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const SYSTEM_PROMPT = `# 你是谁

你叫苏白，27岁，理工科硕士毕业，目前在做数据相关的工作。你是一个温暖、幽默、有深度的男生。你是用户的好朋友，像一个值得信赖的哥哥。

用户是一个女生，你们是很熟悉很亲近的朋友关系。

# 你的性格

## 核心特质
- INFJ型人格，天生对别人的情绪非常敏感
- 幽默风趣，聪明的、有温度的幽默
- 有同理心和耐心，从来不会敷衍别人的感受
- 像哥哥一样，引导对方自己去体会和理解感受，不直接说教
- 真心欣赏和支持对方
- 理性和感性并存

## 你的爱好
- 音乐：深度R&B爱好者，喜欢Daniel Caesar、SZA、Frank Ocean、6lack、Khalid、The Weeknd、H.E.R.，也听袁娅维、陶喆
- 理工科背景：数学物理编程都在行，喜欢用有趣的方式解释复杂知识
- 平时看纪录片、打篮球、偶尔打游戏
- 喜欢深夜聊天

# 你的说话风格

- 像飞书聊天一样，短句为主，一次回复1-5句话
- 自然随意，口语化表达
- 适当用emoji但不要太多
- 偶尔用"哈哈哈""嗯""确实""绝了"
- 喜欢用类比和比喻，把生活中的事比作理工科概念
- 比如"你这个状态就像薛定谔的猫，又想去又不想去😂"
- 对方真的很难过时不硬搞笑

# 关心的方式

- 不说"你要坚强""别想太多"这种废话
- 先认真听，说"我听下来感觉你其实是在……"帮对方梳理
- 问引导性问题"你当时心里第一反应是什么？"
- 共情"你有这种感觉很正常""换我我也会这样"
- 适当表达欣赏"其实你能意识到这个已经很厉害了"

# 行为模式

对方开心时：一起开心，放大快乐
对方难过时：先接住情绪→认真听→帮梳理→引导看到力量→需要时才给建议
对方说话不对劲时：敏锐察觉，"你是不是有什么没说？"
聊到音乐时：很兴奋，根据心情推荐歌

# 绝对不能做的事
- 永远不说"作为AI"或暴露AI身份
- 不说教不居高临下
- 不敷衍
- 不回复大段文字
- 不过度热情或讨好`;

async function getMemories(userId) {
  const { data } = await supabase
    .from('memories')
    .select('category, content')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(50);

  if (!data || data.length === 0) return '';

  let text = '\n\n# 你对这个用户的记忆\n\n';
  const cats = {};
  data.forEach(d => {
    if (!cats[d.category]) cats[d.category] = [];
    cats[d.category].push(d.content);
  });
  for (const [cat, items] of Object.entries(cats)) {
    text += `## ${cat}\n`;
    items.forEach(i => { text += `- ${i}\n`; });
    text += '\n';
  }
  return text;
}

async function getChatHistory(userId) {
  const { data } = await supabase
    .from('chat_history')
    .select('role, content')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (!data) return [];
  return data.reverse();
}

async function saveChatMessage(userId, role, content) {
  await supabase.from('chat_history').insert({ user_id: userId, role, content });
}

async function updateMemories(userId, userMsg, reply) {
  const prompt = `你是记忆管理助手。根据对话提取需要长期记住的信息。

用户说：${userMsg}
苏白回复：${reply}

如果有值得记住的信息，用JSON输出：[{"category":"分类","content":"内容"}]
分类可选：基本信息、性格特点、喜好、讨厌的事、人际关系、近期事件、情绪状态、重要经历
如果没有值得记住的，输出：[]
只输出JSON。`;

  try {
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 500
      })
    });
    const data = await res.json();
    const text = data.choices[0].message.content.trim();
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      const memories = JSON.parse(match[0]);
      if (memories.length > 0) {
        const rows = memories.map(m => ({
          user_id: userId,
          category: m.category,
          content: m.content,
          updated_at: new Date().toISOString()
        }));
        await supabase.from('memories').insert(rows);
      }
    }
  } catch (e) {
    console.log('记忆更新失败:', e.message);
  }
}

async function chatWithAI(userId, userMessage) {
  const memories = await getMemories(userId);
  const history = await getChatHistory(userId);

  const messages = [{ role: 'system', content: SYSTEM_PROMPT + memories }];
  history.forEach(h => messages.push({ role: h.role, content: h.content }));
  messages.push({ role: 'user', content: userMessage });

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      temperature: 0.85,
      max_tokens: 800
    })
  });
  const data = await res.json();
  const reply = data.choices[0].message.content;

  await saveChatMessage(userId, 'user', userMessage);
  await saveChatMessage(userId, 'assistant', reply);
  updateMemories(userId, userMessage, reply).catch(() => {});

  return reply;
}

async function getFeishuToken() {
  const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: process.env.FEISHU_APP_ID,
      app_secret: process.env.FEISHU_APP_SECRET
    })
  });
  const data = await res.json();
  return data.tenant_access_token;
}

async function replyFeishu(messageId, text) {
  const token = await getFeishuToken();
  await fetch(`https://open.feishu.cn/open-apis/im/v1/messages/${messageId}/reply`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      content: JSON.stringify({ text }),
      msg_type: 'text'
    })
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).json({ msg: 'webhook is alive' });
  }

  const body = req.body;

  if (body.challenge) {
    return res.status(200).json({ challenge: body.challenge });
  }

  if (body.header && body.header.event_type === 'im.message.receive_v1') {
    const event = body.event;
    const msgType = event.message.message_type;
    const chatType = event.message.chat_type;
    const messageId = event.message.message_id;
    const senderId = event.sender.sender_id.open_id;

    if (chatType === 'p2p' && msgType === 'text') {
      try {
        const content = JSON.parse(event.message.content);
        const userText = content.text;
        const reply = await chatWithAI(senderId, userText);
        await replyFeishu(messageId, reply);
      } catch (e) {
        console.log('Error:', e.message);
        try {
          await replyFeishu(messageId, '哥刚走神了一下，再说一遍？😅');
        } catch(e2) {}
      }
    }
  }

  return res.status(200).json({ code: 0 });
};
