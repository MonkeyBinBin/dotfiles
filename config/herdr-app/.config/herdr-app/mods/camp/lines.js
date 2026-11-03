// What That Monkey mutters, per mood. One is picked when the mood changes and kept until it changes again.
export const LINES = {
  idle: ["今天也很和平…", "營火真暖", "沒事就是好事", "發呆是一種修行"],
  sleep: ["大家加油，我先睡", "有事再叫我…", "呼…嚕…", "代打辛苦了 zzz"],
  alarm: ["蛤…又要我出手？", "有傭兵卡關了！", "去看一下啦…", "救命信號彈！"],
  happy: ["收工收工！", "戰利品放門口就好", "幹得好，賞香蕉", "凱旋歸來！"],
};

export function pick(mood, avoid) {
  const list = LINES[mood];
  const options = list.filter((l) => l !== avoid);
  return options[Math.floor(Math.random() * options.length)] ?? list[0];
}
