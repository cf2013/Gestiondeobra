import { useRef } from "react";
import { QRCodeCanvas } from "qrcode.react";

export default function QRModal({ unit, onClose }) {
  const url = `${window.location.origin}/u/${unit.qr_token}`;
  const boxRef = useRef(null);

  function imprimir() {
    const canvas = boxRef.current?.querySelector("canvas");
    if (!canvas) {
      window.print();
      return;
    }
    const dataUrl = canvas.toDataURL("image/png");

    let area = document.getElementById("print-area");
    if (!area) {
      area = document.createElement("div");
      area.id = "print-area";
      document.body.appendChild(area);
    }
    area.innerHTML = `
      <div style="text-align:center;padding-top:24px;font-family:Arial,sans-serif;color:#000;">
        <img src="${dataUrl}" style="width:280px;height:280px;" alt="QR" />
        <div style="font-size:26px;font-weight:800;margin-top:18px;">Depto ${unit.label}</div>
        <div style="font-size:15px;color:#333;margin-top:2px;">Piso ${unit.piso}</div>
        <div style="font-size:11px;color:#666;margin-top:10px;word-break:break-all;">${url}</div>
      </div>`;

    const cleanup = () => {
      window.removeEventListener("afterprint", cleanup);
      area.innerHTML = "";
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Depto {unit.label}</h3>
        <div className="qr-box" ref={boxRef}>
          <QRCodeCanvas value={url} size={220} marginSize={2} />
        </div>
        <p className="qr-caption">Depto {unit.label} · Piso {unit.piso}</p>
        <p className="qr-url">{url}</p>
        <div className="modal-actions">
          <button className="btn-accent" onClick={imprimir}>🖨️ Imprimir</button>
          <button onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
