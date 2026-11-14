import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import type { Mesh } from 'three';
import { ProtoApp } from './proto/ProtoApp';

declare global {
  interface Window {
    /** Set true once the scene has rendered; the screenshot script waits for it. */
    __MEMORIA_READY__?: boolean;
  }
}

function Arch() {
  const ref = useRef<Mesh>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.3;
  });
  return (
    <mesh ref={ref} position={[0, 1, 0]}>
      <torusGeometry args={[1, 0.18, 12, 48, Math.PI]} />
      <meshStandardMaterial color="#b4432e" roughness={0.9} />
    </mesh>
  );
}

/** Hello-world scene. Replaced by the palace engine. */
export function App() {
  if (new URLSearchParams(location.search).has('proto')) return <ProtoApp />;
  return <Hello />;
}

function Hello() {
  useEffect(() => {
    const t = setTimeout(() => (window.__MEMORIA_READY__ = true), 300);
    return () => clearTimeout(t);
  }, []);
  return (
    <>
      <Canvas camera={{ position: [0, 1.6, 5], fov: 50 }} dpr={[1, 2]}>
        <color attach="background" args={['#efe6d2']} />
        <ambientLight intensity={0.8} />
        <directionalLight position={[3, 5, 2]} intensity={1.6} />
        <Arch />
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[20, 20]} />
          <meshStandardMaterial color="#d9cdb2" roughness={1} />
        </mesh>
      </Canvas>
      <div style={{ position: 'fixed', left: 32, bottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: 44, letterSpacing: '0.02em' }}>Memoria</h1>
        <p style={{ margin: '4px 0 0', opacity: 0.7 }}>A memory palace you can walk. Under construction.</p>
      </div>
    </>
  );
}
