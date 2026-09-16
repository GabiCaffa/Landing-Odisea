import { useEffect } from "react";

/**
 * Levanta el telón de `#arranque` (ver el `<style>` crítico de `index.html`).
 *
 * **Por qué existe.** El sitio es una SPA: el HTML trae `<div id="root">` vacío
 * y no hay nada que pintar hasta que se ejecutan ~574 KB de JavaScript. En un
 * celular real eso son varios segundos de pantalla vacía. `index.html` pinta
 * mientras tanto la marca sobre el fondo del tema, y este componente la quita.
 *
 * **Por qué el telón vive FUERA de `#root`.** Adentro, React lo borraría de
 * golpe al montar; y como el hero arranca en `opacity 0` y hace un fundido de
 * 700 ms, entre una cosa y la otra quedaba un parpadeo de pantalla vacía.
 * Superpuesto y con su propio fundido, los dos se cruzan.
 *
 * **Por qué un `useEffect` y no un `setTimeout` en `main.tsx`.** `root.render()`
 * de React 18 no es síncrono: agenda el trabajo. Un temporizador puesto justo
 * después no sabe si el DOM ya se escribió. Un efecto, sí — corre después del
 * commit, así que para cuando esto pasa el contenido real YA está en el DOM y
 * los dos fundidos se cruzan en el mismo pintado.
 *
 * **Y por qué NO hay un `requestAnimationFrame` acá.** Fue el primer intento,
 * buscando la garantía de que el navegador llegara a pintar. Se rompía: los
 * `rAF` **no corren en una pestaña en segundo plano**, así que quien abriera el
 * sitio en una pestaña de fondo se encontraba el telón tapando todo al volver,
 * hasta que saltara el seguro de 15s del CSS. Verificado en el build real. El
 * efecto solo alcanza y no tiene ese modo de falla.
 */
const OcultarArranque = () => {
  useEffect(() => {
    const telon = document.getElementById("arranque");
    if (!telon) return;

    telon.classList.add("arranque--listo");
    // Se saca del DOM recién cuando terminó el fundido (0.6s en el CSS). Si
    // quedara, es un elemento a pantalla completa por encima de todo: aunque
    // sea invisible y sin eventos, no tiene por qué seguir ahí.
    const quitar = window.setTimeout(() => telon.remove(), 700);

    return () => clearTimeout(quitar);
  }, []);

  return null;
};

export default OcultarArranque;
