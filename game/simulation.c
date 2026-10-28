#include "game.h"
#include <math.h>
#include <stdio.h>
#include <string.h>
Game game;
static char json[8192];
static float clamp(float v, float low, float high) {
  return fminf(high, fmaxf(low, v));
}
static int random_item(void) {
  game.seed = game.seed * 1664525u + 1013904223u;
  return 1 + (int)((game.seed >> 16) % 3);
}
static void use_item(Car *car, int slot) {
  if (car->held == 1) {
    car->boost = 2;
    car->boost_kind = 2;
  }
  if (car->held >= 2)
    for (int i = 0; i < EFFECTS; i++)
      if (game.effects[i].life <= 0) {
        Effect *e = &game.effects[i];
        memset(e, 0, sizeof(*e));
        e->kind = car->held;
        e->owner = slot;
        e->angle = car->angle;
        e->life = car->held == 2 ? 2.5f : 15.0f;
        float offset = car->held == 2 ? 35.0f : -40.0f;
        e->x = car->x + offset * cosf(car->angle);
        e->y = car->y + offset * sinf(car->angle);
        break;
      }
  car->held = 0;
}
static void step_effects(float dt) {
  for (int i = 0; i < EFFECTS; i++) {
    Effect *e = &game.effects[i];
    if (e->life <= 0)
      continue;
    e->life -= dt;
    e->age += dt;
    if (e->kind == 2) {
      e->x += cosf(e->angle) * 620 * dt;
      e->y += sinf(e->angle) * 620 * dt;
    }
    if (e->x < 0 || e->x > 1200 || e->y < 0 || e->y > 800) {
      e->life = 0;
      continue;
    }
    for (int j = 0; j < PLAYERS; j++) {
      Car *c = &game.cars[j];
      if (!c->present || !c->connected || c->finished ||
          (j == e->owner && (e->kind == 2 || e->age < 0.6f)))
        continue;
      if (hypotf(c->x - e->x, c->y - e->y) < 32) {
        c->slow = 1;
        c->speed *= 0.35f;
        e->life = 0;
        break;
      }
    }
  }
}
EMSCRIPTEN_KEEPALIVE void game_reset(int mask, int seed, int practice) {
  memset(&game, 0, sizeof(game));
  game.mask = mask;
  game.phase = practice ? 1 : 0;
  game.practice = practice;
  game.seed = (uint32_t)seed;
  for (int i = 0; i < 4; i++) {
    float a = i == 0 ? -PI / 2 + 0.28f : (i - 1) * PI / 2;
    game.boxes[i].x = TRACK_CX + TRACK_RX * cosf(a);
    game.boxes[i].y = TRACK_CY + TRACK_RY * sinf(a);
  }
  for (int i = 0; i < PLAYERS; i++) {
    Car *c = &game.cars[i];
    c->present = (mask >> i) & 1;
    c->connected = 1;
    c->x = TRACK_CX - i * 32;
    c->y = TRACK_CY - TRACK_RY + (i % 2) * 28;
    c->track_angle =
        atan2f((c->y - TRACK_CY) / TRACK_RY, (c->x - TRACK_CX) / TRACK_RX) +
        PI / 2;
    if (c->track_angle < 0)
      c->track_angle += 2 * PI;
    c->progress =
        c->track_angle > PI ? c->track_angle - 2 * PI : c->track_angle;
  }
}
EMSCRIPTEN_KEEPALIVE void game_input(int slot, int input) {
  if (slot >= 0 && slot < PLAYERS)
    game.cars[slot].input = input & 63;
}
EMSCRIPTEN_KEEPALIVE void game_connected(int slot, int connected) {
  if (slot >= 0 && slot < PLAYERS) {
    game.cars[slot].connected = connected;
    if (!connected)
      game.cars[slot].input = 0;
  }
}
EMSCRIPTEN_KEEPALIVE void game_step(float dt) {
  dt = clamp(dt, 0, 0.05f);
  game.time += dt;
  if (game.phase == 2)
    return;
  if (game.phase == 0) {
    if (game.time < 3)
      return;
    game.phase = 1;
  }
  for (int i = 0; i < 4; i++)
    game.boxes[i].timer = fmaxf(0, game.boxes[i].timer - dt);
  for (int i = 0; i < PLAYERS; i++) {
    Car *c = &game.cars[i];
    if (!c->present || !c->connected || c->finished)
      continue;
    int key = c->input;
    float theta =
        atan2f((c->y - TRACK_CY) / TRACK_RY, (c->x - TRACK_CX) / TRACK_RX);
    float distance = hypotf(c->x - (TRACK_CX + TRACK_RX * cosf(theta)),
                            c->y - (TRACK_CY + TRACK_RY * sinf(theta)));
    float steer = ((key & RIGHT) ? 1.0f : 0) - ((key & LEFT) ? 1.0f : 0);
    c->boost = fmaxf(0, c->boost - dt);
    c->slow = fmaxf(0, c->slow - dt);
    int drifting = (key & DRIFT) && fabsf(steer) > 0 && c->speed > 80;
    if (drifting)
      c->drift_charge += dt;
    if (c->drift_held && !(key & DRIFT)) {
      if (c->drift_charge > 0.35f && c->boost < 0.95f) {
        c->boost = 0.95f;
        c->boost_kind = 1;
      }
      c->drift_charge = 0;
    }
    c->drift_held = (key & DRIFT) != 0;
    c->drifting = drifting;
    if ((key & ITEM) && !c->use_held && c->held)
      use_item(c, i);
    c->use_held = (key & ITEM) != 0;
    for (int b = 0; b < 4; b++) {
      ItemBox *box = &game.boxes[b];
      if (!c->held && box->timer <= 0 &&
          hypotf(c->x - box->x, c->y - box->y) < 32) {
        c->held = random_item();
        box->timer = 4;
      }
    }
    float maxspeed = distance < ROAD_HALF_WIDTH
                         ? (c->boost > 0 && c->slow <= 0 ? 460 : 340)
                         : 75;
    float reverse_limit = 90;
    if (c->slow > 0) {
      maxspeed *= 0.35f;
      reverse_limit *= 0.35f;
    }
    if (key & BRAKE)
      c->speed -= 310 * dt;
    else if ((key & THROTTLE) || c->boost > 0)
      c->speed += (c->boost > 0 && c->slow <= 0 ? 620 : 220) * dt;
    else
      c->speed *= powf(0.55f, dt);
    c->speed = clamp(c->speed, -reverse_limit, maxspeed);
    if (fabsf(c->speed) > 3)
      c->angle +=
          steer * (drifting ? 2.8f : 2.35f) * dt * (c->speed < 0 ? -1 : 1);
    c->velocity_angle += atan2f(sinf(c->angle - c->velocity_angle),
                                cosf(c->angle - c->velocity_angle)) *
                         fminf(1, dt * (drifting ? 3 : 18));
    c->x = clamp(c->x + cosf(c->velocity_angle) * c->speed * dt, 30, 1170);
    c->y = clamp(c->y + sinf(c->velocity_angle) * c->speed * dt, 30, 770);
    float track =
        atan2f((c->y - TRACK_CY) / TRACK_RY, (c->x - TRACK_CX) / TRACK_RX) +
        PI / 2;
    if (track < 0)
      track += 2 * PI;
    float delta =
        atan2f(sinf(track - c->track_angle), cosf(track - c->track_angle));
    if (distance < ROAD_HALF_WIDTH) {
      c->progress += delta;
      float gate = ((c->checkpoints + 1) % 4) * PI / 2;
      float to_gate = fmodf(gate - c->track_angle + 2 * PI, 2 * PI);
      if (delta > 0 && delta < 0.3f && to_gate < delta) {
        c->checkpoints++;
        if (!game.practice && c->checkpoints >= 12) {
          c->finished = 1;
          c->rank = ++game.finish_count;
          c->speed = 0;
        }
      }
    }
    c->track_angle = track;
  }
  for (int i = 0; i < PLAYERS; i++)
    for (int j = i + 1; j < PLAYERS; j++) {
      Car *a = &game.cars[i], *b = &game.cars[j];
      if (!a->present || !b->present || !a->connected || !b->connected ||
          a->finished || b->finished)
        continue;
      float dx = b->x - a->x, dy = b->y - a->y, d = hypotf(dx, dy);
      if (d > 0.01f && d < 30) {
        float push = (30 - d) / 2;
        a->x -= dx / d * push;
        a->y -= dy / d * push;
        b->x += dx / d * push;
        b->y += dy / d * push;
      }
    }
  step_effects(dt);
  int unfinished = 0;
  for (int i = 0; i < PLAYERS; i++) {
    Car *c = &game.cars[i];
    if (!c->present)
      continue;
    if (!c->finished) {
      c->rank = game.finish_count + 1;
      for (int j = 0; j < PLAYERS; j++)
        if (game.cars[j].present && !game.cars[j].finished &&
            game.cars[j].progress > c->progress)
          c->rank++;
      if (c->connected)
        unfinished++;
    }
  }
  if (!game.practice && !unfinished)
    game.phase = 2;
}
EMSCRIPTEN_KEEPALIVE const char *game_json(void) {
  int n =
      snprintf(json, sizeof(json),
               "{\"phase\":%d,\"time\":%.3f,\"track\":{\"cx\":%d,\"cy\":%d,"
               "\"rx\":%.0f,\"ry\":%.0f},\"cars\":[",
               game.phase, game.time, TRACK_CX, TRACK_CY, TRACK_RX, TRACK_RY);
  for (int i = 0; i < PLAYERS; i++) {
    Car *c = &game.cars[i];
    n += snprintf(
        json + n, sizeof(json) - (size_t)n,
        "%s{\"x\":%.2f,\"y\":%.2f,\"angle\":%.3f,\"speed\":%.1f,\"present\":%d,"
        "\"connected\":%d,\"lap\":%d,\"finished\":%d,\"rank\":%d,\"boost\":%."
        "2f,\"drifting\":%d,\"held\":%d,\"boostKind\":%d,\"slow\":%.2f}",
        i ? "," : "", c->x, c->y, c->angle, c->speed, c->present, c->connected,
        c->checkpoints >= 12 ? 3 : c->checkpoints / 4 + 1, c->finished, c->rank,
        c->boost, c->drifting, c->held, c->boost_kind, c->slow);
  }
  n += snprintf(json + n, sizeof(json) - (size_t)n, "],\"boxes\":[");
  for (int i = 0; i < 4; i++) {
    ItemBox *b = &game.boxes[i];
    n += snprintf(json + n, sizeof(json) - (size_t)n,
                  "%s{\"x\":%.1f,\"y\":%.1f,\"active\":%d}", i ? "," : "", b->x,
                  b->y, b->timer <= 0);
  }
  n += snprintf(json + n, sizeof(json) - (size_t)n, "],\"effects\":[");
  int written = 0;
  for (int i = 0; i < EFFECTS; i++) {
    Effect *e = &game.effects[i];
    if (e->life <= 0)
      continue;
    n += snprintf(json + n, sizeof(json) - (size_t)n,
                  "%s{\"x\":%.1f,\"y\":%.1f,\"kind\":%d}", written++ ? "," : "",
                  e->x, e->y, e->kind);
  }
  snprintf(json + n, sizeof(json) - (size_t)n, "]}");
  return json;
}
EMSCRIPTEN_KEEPALIVE Game *game_state_ptr(void) { return &game; }
EMSCRIPTEN_KEEPALIVE int game_state_size(void) { return sizeof(game); }
