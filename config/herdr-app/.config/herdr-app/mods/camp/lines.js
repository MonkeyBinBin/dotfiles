// What That Monkey mutters, per mood. One is picked when the mood changes and kept until it changes again.
export const LINES = {
  idle: ["Quiet night...", "Nice fire.", "No news is good news.", "Staring is a skill."],
  sleep: ["You got this. Zzz...", "Wake me if it's urgent.", "Five more minutes...", "Good work, mercs. Zzz"],
  alarm: ["Huh? Me? Now?!", "A merc is stuck!", "Go take a look...", "SOS flare!"],
  happy: ["Quest complete!", "Leave the loot by the tent.", "Bananas for everyone!", "They're back!"],
};

export function pick(mood, avoid) {
  const list = LINES[mood];
  const options = list.filter((l) => l !== avoid);
  return options[Math.floor(Math.random() * options.length)] ?? list[0];
}
