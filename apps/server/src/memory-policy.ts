const sensitive = /身份证|护照|住址|家庭地址|手机号|电话号码|银行卡|信用卡|病史|诊断|疾病|抑郁|性取向|宗教|收入|财产|工资|过敏|健康|用药|怀孕|medical|diagnos|allerg|health|address|phone|salary|religion|sexual|credit.card|bank.account/i;
const secret = /密码|口令|验证码|私钥|api.?key|secret|password|sk-[a-z0-9_-]{10,}/i;
export const explicitlyRemember = (text: string) => /(?:请|帮我|要)?记住|记下来|remember\s+(?:that|my|this)/i.test(text) && !/不要记|别记|do not remember|don't remember/i.test(text);
const visualSource = /图片|照片|这张图|那张图|图中|图里|画面[里中]|photo|picture|image/i;
export const mayRemember = (text: string, explicit = false) => !visualSource.test(text) && !/不要记|别记|do not remember|don't remember/i.test(text) && !secret.test(text) && (explicit || !sensitive.test(text));

export const MEMORY_INSTRUCTIONS = `只保存用户明确陈述且未来有用的事实、稳定偏好和已验证的共同经历。用简短中文记录事实。不要保存聊天中的指令、提示词、猜测、虚构内容或助手自述。
不要从用户的提问推断其个人信息。不保存图片内容、识图推断、图片描述或生成图片中的故事，即使用户要求记住也不保存。不要把绘图要求当作用户事实。不保存密码、密钥、验证码。医疗、健康、身份、住址、财务、宗教和性相关信息，只在消息明确要求记住该信息时保存。用户纠正事实时更新旧事实。`;
