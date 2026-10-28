#include "game.h"
#include <SDL.h>
#include <math.h>
static SDL_Renderer *r;
static const int colors[5][3] = {{252, 112, 57},
                                 {118, 92, 212},
                                 {30, 161, 179},
                                 {239, 187, 49},
                                 {225, 102, 159}};
static void color(int red, int green, int blue) {
  SDL_SetRenderDrawColor(r, red, green, blue, 255);
}
static void ellipse(int x, int y, int a, int b) {
  for (int j = -b; j <= b; j++) {
    int dx = (int)(a * sqrtf(1 - (float)(j * j) / (b * b)));
    SDL_RenderDrawLine(r, x - dx, y + j, x + dx, y + j);
  }
}
static void oriented(Car *c, float x, float y, int *px, int *py) {
  *px = (int)(c->x + x * cosf(c->angle) - y * sinf(c->angle));
  *py = (int)(c->y + x * sinf(c->angle) + y * cosf(c->angle));
}
static void panel(Car *c, float x0, float y0, float x1, float y1) {
  for (float y = y0; y < y1; y++) {
    int ax, ay, bx, by;
    oriented(c, x0, y, &ax, &ay);
    oriented(c, x1, y, &bx, &by);
    SDL_RenderDrawLine(r, ax, ay, bx, by);
  }
}
EMSCRIPTEN_KEEPALIVE int game_init(void) {
  if (SDL_Init(SDL_INIT_VIDEO) != 0)
    return 0;
  SDL_Window *w =
      SDL_CreateWindow("Pocket Circuit", 0, 0, 1200, 800, SDL_WINDOW_SHOWN);
  if (!w)
    return 0;
  r = SDL_CreateRenderer(w, -1, SDL_RENDERER_ACCELERATED);
  return r != NULL;
}
EMSCRIPTEN_KEEPALIVE void game_draw(int local) {
  if (!r)
    return;
  color(172, 205, 146);
  SDL_RenderClear(r);
  color(191, 219, 164);
  for (int i = 0; i < 22; i++) {
    int x = (i * 173 + 35) % 1200, y = (i * 271 + 80) % 800;
    ellipse(x, y, 24, 12);
  }
  color(229, 225, 207);
  ellipse(600, 400, 500, 325);
  color(244, 121, 96);
  ellipse(600, 400, 491, 316);
  color(255, 246, 226);
  for (int i = 0; i < 80; i += 2) {
    float t = i * 2 * PI / 80;
    SDL_Rect dot = {(int)(600 + 485 * cosf(t)) - 4,
                    (int)(400 + 310 * sinf(t)) - 4, 9, 9};
    SDL_RenderFillRect(r, &dot);
  }
  color(76, 81, 105);
  ellipse(600, 400, 478, 303);
  color(96, 100, 121);
  for (int i = 0; i < 96; i++) {
    float t = i * 2 * PI / 96;
    SDL_RenderDrawLine(r, (int)(600 + 395 * cosf(t)),
                       (int)(400 + 225 * sinf(t)), (int)(600 + 406 * cosf(t)),
                       (int)(400 + 231 * sinf(t)));
  }
  color(246, 239, 215);
  ellipse(600, 400, 320, 147);
  color(191, 219, 164);
  ellipse(600, 400, 307, 135);
  color(161, 196, 136);
  ellipse(600, 407, 225, 74);
  for (int x = 584; x < 616; x += 8)
    for (int y = 101; y < 253; y += 8) {
      int light = ((x + y) / 8) % 2;
      color(light ? 248 : 48, light ? 242 : 46, light ? 222 : 66);
      SDL_Rect sq = {x, y, 8, 8};
      SDL_RenderFillRect(r, &sq);
    }
  for (int i = 0; i < 16; i++) {
    int x = (i * 263 + 20) % 1200, y = (i * 127 + 25) % 800;
    float t = atan2f((y - 400) / 225.0f, (x - 600) / 400.0f);
    if (hypotf(x - (600 + 400 * cosf(t)), y - (400 + 225 * sinf(t))) < 120)
      continue;
    color(135, 172, 118);
    ellipse(x + 3, y + 5, 17, 15);
    color(68, 132, 96);
    ellipse(x, y, 15, 18);
    color(91, 154, 107);
    ellipse(x - 4, y - 5, 9, 10);
  }
  for (int i = 0; i < 4; i++) {
    ItemBox *b = &game.boxes[i];
    if (b->timer > 0)
      continue;
    int x = (int)b->x, y = (int)b->y;
    color(48, 127, 146);
    SDL_Rect shadow = {x - 13, y - 10, 28, 28};
    SDL_RenderFillRect(r, &shadow);
    color(112, 221, 216);
    SDL_Rect box = {x - 14, y - 14, 26, 26};
    SDL_RenderFillRect(r, &box);
    color(255, 247, 192);
    SDL_Rect a = {x - 3, y - 10, 5, 18}, z = {x - 9, y - 4, 17, 5};
    SDL_RenderFillRect(r, &a);
    SDL_RenderFillRect(r, &z);
  }
  for (int i = 0; i < EFFECTS; i++) {
    Effect *e = &game.effects[i];
    if (e->life <= 0)
      continue;
    if (e->kind == 2) {
      color(96, 60, 151);
      ellipse((int)e->x, (int)e->y, 12, 12);
      color(248, 216, 107);
      ellipse((int)e->x - 3, (int)e->y - 3, 7, 7);
    } else {
      color(231, 120, 169);
      ellipse((int)e->x, (int)e->y, 17, 17);
      color(255, 226, 238);
      ellipse((int)e->x - 5, (int)e->y - 6, 6, 6);
    }
  }
  for (int i = 0; i < PLAYERS; i++) {
    Car *c = &game.cars[i];
    if (!c->present)
      continue;
    if (c->boost > 0) {
      color(253, 188, 58);
      panel(c, -33, -6, -20, 6);
      color(255, 242, 158);
      panel(c, -28, -3, -20, 3);
    }
    if (c->drifting) {
      color(236, 231, 204);
      ellipse((int)(c->x - 30 * cosf(c->angle)),
              (int)(c->y - 30 * sinf(c->angle)), 8, 7);
    }
    if (i == local) {
      color(255, 249, 217);
      ellipse((int)c->x, (int)c->y, 23, 23);
    }
    color(53, 57, 76);
    panel(c, -18, -14, 17, -9);
    panel(c, -18, 9, 17, 14);
    color(c->connected ? colors[i][0] : 152, c->connected ? colors[i][1] : 161,
          c->connected ? colors[i][2] : 164);
    panel(c, -21, -10, 21, 10);
    color(48, 54, 81);
    panel(c, 3, -8, 12, 8);
    color(242, 242, 219);
    panel(c, -8, -2, 20, 2);
    color(255, 223, 139);
    panel(c, 19, -9, 22, -5);
    panel(c, 19, 5, 22, 9);
  }
  SDL_RenderPresent(r);
}
