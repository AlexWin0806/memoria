import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { type Group, RingGeometry } from 'three';
import type { PalaceSpec } from '@/core/types';
import { GoldenHand, type Placement, Repeated } from '@/layouts/domus/parts';
import type { PalaceLayout } from '@/layouts/types';
import { LocusFeature } from '@/scene/LocusFeature';
import { Surface } from '@/styles';
import { Inscription } from './Inscription';
import { type PalacePlan, planLayout } from './plan';

/** The mark of a plot: a thin eight-sided line set into the floor where a place stands or will stand. */
const PLOT = () => new RingGeometry(1.165, 1.2, 8, 1);

function Plots({ plan }: { plan: PalacePlan }) {
  const items = useMemo(() => plan.plots.map(([x, , z]): Placement => ({ p: [x, 0.008, z], r: [-Math.PI / 2, 0, Math.PI / 8] })), [plan]);
  return (
    <Repeated items={items} make={PLOT}>
      <Surface slot="trim" />
    </Repeated>
  );
}

/**
 * A generated palace: the kit draws each room, the generator stands the places in them.
 * Empty plots keep their floor mark, so a room that is extended later gains a feature and
 * loses nothing.
 */
function Structure({ plan }: { plan: PalacePlan }) {
  const { kit, rooms } = plan;
  return (
    <group>
      {rooms.map((room) => (
        <group key={room.spec.id} position={room.origin}>
          <kit.Room index={room.index} shape={room.shape} plan={room.plan} plots={room.plots} mirrored={room.mirrored} open={room.index < rooms.length - 1} />
          {/* over the doorway into this room, on the face seen by whoever is about to walk in */}
          <Inscription
            text={room.spec.name}
            position={[0, kit.signHeight ?? (room.plan.signBottom + room.plan.signTop) / 2, room.plan.partition]}
            maxWidth={2 * room.plan.signHalfWidth}
          />
        </group>
      ))}
      <Plots plan={plan} />
      <Places plan={plan} />
    </group>
  );
}

/**
 * The features of rooms further than this from the room the camera is in are not drawn.
 * Looking down the axis of a six-room palace every room is in the frustum, and the features
 * are most of the draw calls; three doorways away one is a few pixels in a far doorway.
 */
const FEATURE_REACH = 2;

function Places({ plan }: { plan: PalacePlan }) {
  const { rooms } = plan;
  const Backdrop = plan.kit.Backdrop;
  const groups = useRef<(Group | null)[]>([]);
  const byRoom = useMemo(() => rooms.map((room) => plan.places.filter((p) => p.roomIndex === room.index)), [plan, rooms]);
  useFrame(({ camera }) => {
    // The room the camera is in: the last one whose entrance it has passed.
    let here = 0;
    for (let i = 1; i < rooms.length; i++) if (camera.position.z < rooms[i].origin[2]) here = i;
    for (let i = 0; i < rooms.length; i++) {
      const group = groups.current[i];
      if (group) group.visible = Math.abs(i - here) <= FEATURE_REACH;
    }
  });
  return (
    <>
      {byRoom.map((places, i) => (
        <group
          key={rooms[i].spec.id}
          ref={(group) => {
            groups.current[i] = group;
          }}
        >
          {places.map((place) => (
            <group key={place.slot}>
              <LocusFeature index={place.locusIndex}>
                <group position={place.position} rotation={[0, place.yaw, 0]}>
                  <place.feature.Component accent={place.accent} />
                </group>
              </LocusFeature>
              {/* what a wall feature hangs on, in a kit without walls: architecture, so outside the feature */}
              {Backdrop && place.feature.mount === 'wall' && (
                <group position={place.position} rotation={[0, place.yaw, 0]}>
                  <Backdrop />
                </group>
              )}
              {/* the counting marker is the route's, not the feature's: it stands whatever state the place is in */}
              {place.hand && <GoldenHand position={place.hand.position} facing={place.hand.facing} stem={0.86} />}
            </group>
          ))}
        </group>
      ))}
    </>
  );
}

/** The layout of a generated palace: `planLayout` (pure data) plus the geometry that draws it. */
export function buildLayout(spec: PalaceSpec): PalaceLayout {
  const plan = planLayout(spec);
  const GeneratedStructure = () => <Structure plan={plan} />;
  return { ...plan.meta, Structure: GeneratedStructure, footprint: plan.footprint, tone: plan.kit.tone };
}

export { planLayout } from './plan';
