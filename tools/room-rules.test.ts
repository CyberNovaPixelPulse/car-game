import assert from "node:assert/strict";
import { test } from "node:test";
import type { Member } from "../web/network";
import { canStartBattle, updateLobbyCrew } from "../web/room-rules";

function member(slot: number, details: Partial<Member> = {}): Member {
  return {
    slot,
    name: `乘員 ${slot + 1}`,
    connected: true,
    role: null,
    ready: false,
    ...details,
  };
}

test("已有人擔任的職位不能被另一位乘員取得", () => {
  const owner = member(0, { role: "driver" });
  const other = member(1, { role: "gunner", ready: true });

  const notice = updateLobbyCrew(other, [owner, other], "driver", undefined);

  assert.match(notice ?? "", /職位已有人擔任/);
  assert.equal(owner.role, "driver");
  assert.equal(other.role, "gunner");
  assert.equal(other.ready, true);
});

test("換職位會取消原來的準備", () => {
  const host = member(0, { role: "driver", ready: true });

  assert.equal(updateLobbyCrew(host, [host], "gunner", undefined), undefined);

  assert.equal(host.role, "gunner");
  assert.equal(host.ready, false);
});

test("選好職位後才可以準備", () => {
  const host = member(0);

  const notice = updateLobbyCrew(host, [host], undefined, true);
  assert.match(notice ?? "", /先選擇職位再準備/);
  assert.equal(host.ready, false);

  updateLobbyCrew(host, [host], "loader", undefined);
  assert.equal(updateLobbyCrew(host, [host], undefined, true), undefined);
  assert.equal(host.ready, true);
});

function readyCrew(): Member[] {
  return [
    member(0, { role: "loader", ready: true }),
    member(1, { role: "driver", ready: true }),
    member(2, { role: "gunner", ready: true }),
  ];
}

test("全員準備時只有房主可以從房間開始戰鬥", () => {
  const crew = readyCrew();

  assert.equal(canStartBattle(true, "lobby", crew), true);
  assert.equal(canStartBattle(false, "lobby", crew), false);
  assert.equal(canStartBattle(true, "battle", crew), false);
  assert.equal(canStartBattle(true, "results", crew), false);
});

test("人不齊、斷線、未選職位或未準備時，房主無法開始戰鬥", () => {
  const [host, driver, gunner] = readyCrew();

  assert.equal(canStartBattle(true, "lobby", [host, driver]), false);
  assert.equal(
    canStartBattle(true, "lobby", [
      host,
      driver,
      { ...gunner, connected: false },
    ]),
    false,
  );
  assert.equal(
    canStartBattle(true, "lobby", [host, driver, { ...gunner, role: null }]),
    false,
  );
  assert.equal(
    canStartBattle(true, "lobby", [host, driver, { ...gunner, ready: false }]),
    false,
  );
});
