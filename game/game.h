#ifndef POCKET_GAME_H
#define POCKET_GAME_H
#include <emscripten.h>
#include <stdint.h>
#define PLAYERS 5
#define EFFECTS 32
#define TRACK_CX 600
#define TRACK_CY 400
#define TRACK_RX 400.0f
#define TRACK_RY 225.0f
#define ROAD_HALF_WIDTH 76
#define PI 3.14159265358979323846f
enum { THROTTLE = 1, BRAKE = 2, LEFT = 4, RIGHT = 8, DRIFT = 16, ITEM = 32 };
typedef struct {
  float x, y, angle, speed, track_angle, progress, boost, drift_charge,
      velocity_angle, slow;
  int present, connected, input, checkpoints, finished, rank, drifting,
      drift_held, held, use_held, boost_kind;
} Car;
typedef struct {
  float x, y, timer;
} ItemBox;
typedef struct {
  float x, y, angle, life, age;
  int kind, owner;
} Effect;
typedef struct {
  float time;
  int phase, mask, practice, finish_count;
  Car cars[PLAYERS];
  ItemBox boxes[4];
  Effect effects[EFFECTS];
  uint32_t seed;
} Game;
extern Game game;
#endif
