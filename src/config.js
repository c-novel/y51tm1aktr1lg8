// 현장에서 조정하는 값은 전부 여기 모은다.
export const CONFIG = {
  link: "whif.io",

  // QR 디자인. color = 점 색, dot = "square" | "dots"
  designs: {
    thumb: { color: "#000000", dot: "square" },
    victory: { color: "#8a5de5", dot: "dots" },
    palm: { color: "#8a5de5", dot: "square", image: "assets/ghost.png" },
  },

  // MediaPipe 손동작 이름 → 디자인
  gestures: {
    Thumb_Up: "thumb",
    Victory: "victory",
    Open_Palm: "palm",
  },
  gestureMinScore: 0.6, // 이 점수 이상일 때만 동작으로 인정
  gestureHoldMs: 400, // 같은 동작이 이만큼 유지돼야 QR 표시

  faceMinWidth: 0.12, // 얼굴 폭이 화면 폭의 이 비율 이상이면 "다가옴"
  faceLostMs: 1500, // 얼굴이 이만큼 안 보이면 떠난 것으로 봄

  qrHoldAfterGestureMs: 5000, // 동작을 내린 뒤 QR을 유지하는 시간
  cooldownMs: 3000, // QR이 내려간 뒤 다시 띄우기까지 최소 간격

  // 이퀄라이저
  qrHeightRatio: 0.86, // 화면 높이 대비 QR 크기
  eqMaxBoxes: 5, // 막대 최대 높이 (박스 개수)
  eqIdleAmp: 0.22, // 아무도 없을 때 출렁임 크기 (0~1)
  eqEngagedAmp: 0.4, // 사람이 다가왔을 때 기본 크기
  eqMotionGain: 3.0, // 움직임이 출렁임에 주는 영향
  motionSmoothing: 0.15,

  visionFps: 15,
};
