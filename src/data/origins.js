/**
 * 출신 배경 (v0.3 §9.1). 전투 능력은 같고, 시작 소지품과 소개 대사만 다르다.
 * 출신은 직업·세력 가입을 제한하지 않는다. 소지품·대사는 검증 전 예시.
 */
export const ORIGINS = {
  farm: { id: 'farm', name: '농가 출신', item: 'bread', desc: '계곡 바깥 농가에서 자랐다. 날씨와 가축을 읽는다.',
    intro: '수확이 끝난 뒤라 짐은 가볍다. 다리가 끊겼다는 소식에 곡식 수레들이 거점 앞에 멈춰 서 있다.' },
  port: { id: 'port', name: '항구 노동자', item: 'rope', desc: '부두에서 짐을 지고 밧줄을 맸다.',
    intro: '항구 일이 끊긴 철이라 일거리를 찾아 내륙 교역로를 따라왔다. 멈춘 수레들이 먼저 눈에 들어온다.' },
  workshop: { id: 'workshop', name: '공방 견습', item: 'toolkit', desc: '어느 공방에서 도구 쓰는 법을 배웠다.',
    intro: '스승의 공방을 떠난 지 열흘. 손에 익은 공구 주머니가 아직 묵직하다. 다리 소식이 들려온다.' },
  wanderer: { id: 'wanderer', name: '유랑민', item: 'map', desc: '한곳에 머물지 않고 길을 따라 살았다.',
    intro: '늘 지나가던 다리가 무너졌다. 접힌 지도 위에 다른 길을 그어야 할 때다.' },
  ruin: { id: 'ruin', name: '폐허 정착민', item: 'lantern', desc: '무너진 마을 터에 다시 집을 지은 사람들 사이에서 컸다.',
    intro: '무너진 것을 다시 세우는 일은 익숙하다. 하르벤 교역 거점의 사람들도 지금 그 일을 하고 있다.' },
};
export const ORIGIN_ORDER = ['farm', 'port', 'workshop', 'wanderer', 'ruin'];
