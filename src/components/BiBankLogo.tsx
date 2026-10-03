import React, { useId } from 'react';

// Logo BiBank según el manual de marca: anillo abierto arriba a la derecha con el
// punto verde institucional en el corte, "Bi" dentro y "Bank" en Poppins Medium.
// Variantes aprobadas: negro sobre claro ('dark') y blanco sobre oscuro ('light');
// el punto siempre es verde institucional. Zona de seguridad: 50% del diámetro del
// isologo alrededor (a cargo de quien lo ubica).

const GREEN = '#35EEC8';

// Centro y radio del isologo dentro de un viewBox de 100 de alto.
const CX = 50, CY = 50, R = 40, STROKE = 8.5;
// Posición del punto: sobre el anillo, a ~50° (arriba a la derecha).
const DOT_ANGLE = (50 * Math.PI) / 180;
const DOT = { x: CX + R * Math.cos(DOT_ANGLE), y: CY - R * Math.sin(DOT_ANGLE) };

type Props = {
  className?: string;
  variant?: 'dark' | 'light';
  // 'full' = isologo + "Bank"; 'icon' = solo isologo.
  layout?: 'full' | 'icon';
};

export const BiBankLogo = ({ className = 'h-8', variant = 'dark', layout = 'full' }: Props) => {
  const maskId = useId();
  const ink = variant === 'light' ? '#FFFFFF' : '#000000';
  const width = layout === 'icon' ? 100 : 292;
  return (
    <svg
      viewBox={`0 0 ${width} 100`}
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="BiBank"
    >
      <defs>
        {/* El corte del anillo alrededor del punto */}
        <mask id={maskId}>
          <rect x="0" y="0" width="100" height="100" fill="white" />
          <circle cx={DOT.x} cy={DOT.y} r="13.5" fill="black" />
        </mask>
      </defs>
      <circle cx={CX} cy={CY} r={R} stroke={ink} strokeWidth={STROKE} mask={`url(#${maskId})`} />
      <circle cx={DOT.x} cy={DOT.y} r="7.5" fill={GREEN} />
      <text
        x={CX - 1}
        y="65"
        textAnchor="middle"
        fontFamily="Poppins, Inter, sans-serif"
        fontWeight="700"
        fontSize="44"
        letterSpacing="-1"
        fill={ink}
      >
        Bi
      </text>
      {layout === 'full' && (
        <text x="104" y="69" fontFamily="Poppins, Inter, sans-serif" fontWeight="500" fontSize="56" letterSpacing="-1.5" fill={ink}>
          Bank
        </text>
      )}
    </svg>
  );
};
