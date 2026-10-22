#!/usr/bin/env python3
"""把歌词用 edge-tts 唱成歌（简易歌声合成，供 qq-bridge 的 qq_sing_song 工具调用）。

原理：每个字单独合成语音 → ffmpeg 用 asetrate+atempo 把它搬到目标音高（保持时长）→
按节拍拼接成一首歌。不是专业歌声合成（那是 DiffSinger / GPT-SoVITS 的活），
但旋律能听懂、音色是软萌女声，用来撒娇/整活足够。

用法：python3 sing.py <song> <out.mp3>
"""
import asyncio
import os
import shutil
import subprocess
import sys
import tempfile
import wave

import edge_tts

# ffmpeg 解析顺序：环境变量 FFMPEG_PATH → PATH 里的 ffmpeg → Homebrew 常见位置（最后兜底）。
# 不写死某台机器的路径：换机器/Intel Mac/Linux 都能找到，找不到时下面的报错会提示怎么装。
FFMPEG = os.environ.get("FFMPEG_PATH") or shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"
VOICE = "zh-CN-XiaoyiNeural"
SR = 24000
# 说话基频近似（女声），音高映射以它为 1.0 基准
BASE_FREQ = 260.0

NOTES = {
    "C4": 261.63, "D4": 293.66, "E4": 329.63, "F4": 349.23, "G4": 392.00,
    "A4": 440.00, "B4": 493.88, "C5": 523.25, "D5": 587.33, "E5": 659.25,
    "F5": 698.46, "G5": 783.99, "A5": 880.00,
}

SONGS = {
    "小星星": {
        "lyrics": list("一闪一闪亮晶晶满天都是小星星"),
        "notes": ["C4","C4","G4","G4","A4","A4","G4","F4","F4","E4","E4","D4","D4","C4"],
    },
    "生日快乐": {
        "lyrics": list("祝你生日快乐祝你生日快乐"),
        "notes": ["G4","G4","A4","G4","C5","B4","G4","G4","A4","G4","D5","C5"],
    },
    "两只老虎": {
        "lyrics": list("两只老虎两只老虎跑得快跑得快"),
        "notes": ["C4","D4","E4","C4","C4","D4","E4","C4","E4","F4","G4","E4","F4","G4"],
    },
}
# 每拍时长（秒），最后一个字稍长
BEAT = 0.55
GAP = 0.06


async def synth_syllable(text: str, path: str) -> None:
    communicate = edge_tts.Communicate(text, VOICE, rate="+0%", pitch="+0Hz")
    await communicate.save(path)


def pitch_shift(src: str, dst: str, ratio: float) -> None:
    ratio = max(0.55, min(1.9, ratio))
    atempo = max(0.55, min(1.8, 1.0 / ratio))
    filters = f"aresample={SR},asetrate={SR}*{ratio:.5f},atempo={atempo:.5f},volume=0.95"
    subprocess.run(
        [FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-i", src,
         "-filter:a", filters, "-ac", "1", "-ar", str(SR), dst],
        check=True,
    )


def read_wav(path: str):
    with wave.open(path, "rb") as w:
        return w.getnchannels(), w.getsampwidth(), w.getframerate(), w.readframes(w.getnframes())


def trim_silence_frames(frames: bytes, sampwidth: int, threshold: int = 220):
    step = max(1, sampwidth)
    # 简单去掉首尾低能量部分（16bit little-endian）
    if sampwidth != 2:
        return frames
    n = len(frames) // 2
    start = 0
    end = n
    for i in range(n):
        if abs(int.from_bytes(frames[i*2:i*2+2], "little", signed=True)) > threshold:
            start = max(0, i - int(0.01 * SR))
            break
    for i in range(n - 1, -1, -1):
        if abs(int.from_bytes(frames[i*2:i*2+2], "little", signed=True)) > threshold:
            end = min(n, i + int(0.02 * SR))
            break
    return frames[start*2:end*2]


def main():
    if len(sys.argv) < 3:
        print("usage: sing.py <song> <out.mp3>", file=sys.stderr)
        return 2
    song_name, out_path = sys.argv[1], sys.argv[2]
    song = SONGS.get(song_name)
    if not song:
        print(f"unknown song: {song_name}; available: {', '.join(SONGS)}", file=sys.stderr)
        return 2
    if not os.path.exists(FFMPEG):
        print(
            f"ffmpeg not found: {FFMPEG}\n"
            "装一个即可：macOS `brew install ffmpeg` / Debian `apt install ffmpeg`，"
            "或用 FFMPEG_PATH=/path/to/ffmpeg 指定。",
            file=sys.stderr,
        )
        return 3
    silence = b"\x00\x00" * int(GAP * SR)
    frames_all = bytearray()
    with tempfile.TemporaryDirectory(prefix="sing-") as tmp:
        for idx, (ch, note) in enumerate(zip(song["lyrics"], song["notes"])):
            mp3 = os.path.join(tmp, f"{idx}.mp3")
            wav = os.path.join(tmp, f"{idx}.wav")
            asyncio.run(synth_syllable(ch, mp3))
            ratio = NOTES[note] / BASE_FREQ
            pitch_shift(mp3, wav, ratio)
            _, sw, _, frames = read_wav(wav)
            frames_all += trim_silence_frames(frames, sw)
            # 音符之间留一点空隙；句尾（每 7 或 6 字）多留一点
            frames_all += silence
            if (idx + 1) % 7 == 0:
                frames_all += silence
    with wave.open(out_path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(bytes(frames_all))
    return 0


if __name__ == "__main__":
    sys.exit(main())
