/* ============================================================
   KREATIVE · APP (partagé par le portail client et l'admin)
   Icônes, coquille (barre latérale + panneau), routeur par #,
   appels à l'API, fenêtres, toasts, thème sombre, formats.
   ============================================================ */
(function () {
  const K = window.K = {};
  // le logo Kreative (logo + texte), dessiné dans la page : pas de fichier à charger, affiché tout de suite
  K.logo = '<svg class="k-marque" viewBox="0 0 125.3 24.7" role="img" aria-label="Kreative" fill="currentColor"><path fill-rule="evenodd" d="M10.1 24.36C9.76 24.17 9.32 23.93 9.12 23.82C8.93 23.71 8.51 23.47 8.19 23.28C7.86 23.1 7.3 22.78 6.94 22.58C6.58 22.37 6.28 22.2 6.27 22.2C6.26 22.2 6.12 22.12 5.97 22.03C5.7 21.87 4.79 21.36 4.25 21.06C4.13 20.99 3.96 20.9 3.88 20.85C3.79 20.8 3.61 20.7 3.48 20.62C3.03 20.37 1.63 19.59 1.28 19.39C1.08 19.28 0.84 19.14 0.73 19.08C0.4 18.9 0.1 18.51 0.1 18.25C0.1 18.2 0.08 18.14 0.05 18.12C-0.01 18.09 -0.02 6.47 0.04 6.43C0.07 6.41 0.1 6.34 0.12 6.26C0.15 6.06 0.47 5.75 0.8 5.56C0.95 5.48 1.23 5.32 1.43 5.21C1.62 5.1 2.14 4.81 2.58 4.57C3.02 4.32 3.45 4.07 3.55 4.02C3.65 3.96 4.19 3.66 4.75 3.35C5.31 3.04 5.9 2.72 6.05 2.63C6.2 2.54 6.71 2.26 7.18 2C7.64 1.75 8.11 1.48 8.21 1.42C8.31 1.35 8.41 1.3 8.42 1.3C8.44 1.3 8.98 1 9.5 0.71C10.85 -0.05 10.73 0 11.15 0C11.56 -0 11.69 0.06 13.18 0.96C13.31 1.05 13.5 1.15 13.58 1.2C14.32 1.62 14.36 1.73 14 2.3C13.93 2.42 13.56 3.03 13.2 3.65C12.84 4.27 12.48 4.88 12.4 5C12.32 5.12 11.96 5.73 11.6 6.35C11.23 6.97 10.84 7.64 10.72 7.84C10.6 8.04 10.5 8.21 10.5 8.22C10.5 8.23 10.38 8.44 10.23 8.68C10.09 8.93 9.77 9.46 9.53 9.88C9.28 10.29 8.98 10.8 8.85 11.03C8.29 11.97 8.15 12.23 8.15 12.3C8.15 12.35 8.24 12.53 8.34 12.7C8.45 12.88 8.77 13.42 9.05 13.9C9.33 14.38 9.69 14.99 9.85 15.25C10.01 15.51 10.43 16.23 10.8 16.85C11.16 17.47 11.55 18.11 11.65 18.28C11.75 18.44 12.03 18.89 12.25 19.28C12.48 19.66 13 20.54 13.42 21.22C13.83 21.91 14.19 22.55 14.23 22.63C14.32 22.84 14.25 23.01 14.03 23.14C13.94 23.19 13.59 23.4 13.25 23.6C12.91 23.8 12.41 24.09 12.15 24.25C11.15 24.85 11.01 24.86 10.1 24.36ZM55.59 21.58C55.58 21.56 55.41 21.52 55.22 21.5C53.15 21.23 51.21 19.94 50.3 18.24C49.6 16.92 49.38 15.04 49.75 13.58C49.77 13.47 49.81 13.31 49.83 13.23C49.84 13.14 49.88 13.03 49.9 12.98C49.92 12.92 49.99 12.74 50.05 12.58C50.83 10.52 52.93 8.9 55.15 8.63C56.26 8.49 57.43 8.52 58.24 8.7C58.8 8.83 58.94 8.87 59.23 8.96C59.89 9.18 60.93 9.78 61.38 10.21C61.49 10.31 61.59 10.4 61.6 10.4C61.68 10.4 62.7 11.72 62.7 11.82C62.7 11.83 62.76 11.95 62.84 12.09C63.23 12.74 63.47 13.59 63.56 14.63C63.59 14.98 63.59 15.4 63.57 15.65L63.53 16.07L58.53 16.09C55.06 16.1 53.52 16.12 53.5 16.15C53.45 16.24 53.57 16.7 53.75 17.07C54.03 17.66 54.71 18.28 55.25 18.44C55.38 18.48 55.52 18.53 55.58 18.55C55.95 18.7 57.63 18.7 57.73 18.54C57.74 18.52 57.8 18.5 57.85 18.5C58.13 18.5 58.76 18.15 59.15 17.77L59.43 17.5L61.3 17.5C62.33 17.5 63.21 17.5 63.24 17.5C63.35 17.5 63.28 17.72 62.98 18.35C62.65 19.05 61.82 20 61.12 20.46C60.18 21.08 59.45 21.36 58.4 21.51C57.98 21.56 55.64 21.62 55.59 21.58ZM70.23 21.55C70.17 21.53 70.05 21.51 69.96 21.5C69.86 21.5 69.69 21.48 69.58 21.45C69.47 21.42 69.29 21.37 69.17 21.34C67.71 20.96 66.33 19.99 65.49 18.75C64.92 17.91 64.7 17.34 64.49 16.15C64.41 15.73 64.41 14.49 64.49 13.98C64.53 13.76 64.57 13.49 64.58 13.39C64.6 13.28 64.63 13.19 64.66 13.17C64.68 13.16 64.7 13.1 64.7 13.05C64.7 12.99 64.72 12.91 64.75 12.86C64.77 12.81 64.85 12.62 64.93 12.43C65.46 11.1 66.53 9.95 67.81 9.33C68.02 9.23 68.21 9.15 68.22 9.15C68.24 9.15 68.35 9.11 68.46 9.06C68.69 8.95 69.21 8.8 69.67 8.69C70.08 8.6 72.11 8.6 72.5 8.69C73.75 8.98 74.63 9.42 75.22 10.05C75.3 10.13 75.39 10.2 75.41 10.2C75.43 10.2 75.45 9.9 75.45 9.53C75.45 9.04 75.47 8.86 75.51 8.84C75.55 8.83 76.33 8.83 77.26 8.84L78.95 8.85L78.95 15.1L78.95 21.35L77.21 21.34L75.48 21.33L75.46 20.69C75.45 20.31 75.43 20.05 75.4 20.05C75.37 20.05 75.21 20.18 75.04 20.35C74.34 21.01 73.7 21.33 72.7 21.51C72.34 21.57 70.35 21.61 70.23 21.55ZM117 21.55C116.93 21.53 116.79 21.51 116.68 21.5C116.57 21.5 116.39 21.48 116.28 21.45C116.17 21.42 115.98 21.37 115.88 21.34C113.58 20.74 111.72 18.88 111.31 16.74C111.28 16.58 111.23 16.33 111.2 16.19C111.13 15.87 111.16 14.08 111.24 13.75C111.27 13.63 111.31 13.46 111.33 13.38C111.34 13.29 111.38 13.18 111.4 13.12C111.42 13.07 111.49 12.9 111.55 12.74C111.9 11.76 112.62 10.72 113.4 10.1C113.55 9.98 113.7 9.85 113.74 9.81C113.78 9.78 113.83 9.75 113.85 9.75C113.87 9.75 113.93 9.72 113.97 9.67C114.12 9.52 115.3 8.95 115.46 8.95C115.51 8.95 115.56 8.93 115.57 8.91C115.59 8.88 115.66 8.85 115.74 8.84C115.81 8.82 116.01 8.78 116.18 8.73C117.02 8.52 118.12 8.46 119.06 8.57C119.92 8.68 120.47 8.8 121.03 9C122.67 9.59 124.25 11.12 124.8 12.65C124.83 12.75 124.88 12.87 124.9 12.93C125 13.19 125.11 13.69 125.22 14.44C125.31 15.04 125.32 15.25 125.25 15.61C125.22 15.76 125.18 15.93 125.17 15.99C125.15 16.1 125.15 16.1 120.08 16.1C115.67 16.1 115.01 16.11 114.98 16.17C114.95 16.27 115.2 16.97 115.37 17.27C115.64 17.73 116.41 18.4 116.67 18.4C116.71 18.4 116.76 18.42 116.78 18.45C116.79 18.48 116.86 18.5 116.93 18.5C116.99 18.5 117.06 18.52 117.07 18.54C117.1 18.59 117.34 18.62 118 18.68C118.43 18.72 119.28 18.61 119.68 18.45C119.73 18.43 119.85 18.38 119.95 18.35C120.22 18.25 120.55 18.01 120.8 17.74L121.03 17.5L122.97 17.5C124.04 17.49 124.92 17.5 124.93 17.52C124.98 17.56 124.46 18.59 124.22 18.96C123.27 20.37 121.75 21.25 119.76 21.55C119.35 21.61 117.19 21.61 117 21.55ZM87.12 21.45C87.07 21.43 86.92 21.41 86.79 21.4C86.37 21.4 85.55 21.15 85.06 20.89C84.9 20.81 84.71 20.7 84.63 20.66C84.21 20.44 83.51 19.63 83.26 19.07C83.22 18.99 83.17 18.89 83.14 18.84C83.12 18.79 83.1 18.71 83.1 18.65C83.1 18.6 83.08 18.54 83.06 18.53C83.03 18.51 83 18.43 82.98 18.34C82.96 18.25 82.92 18.05 82.89 17.9C82.86 17.73 82.82 16.49 82.81 14.78L82.78 11.93L81.69 11.91L80.6 11.9L80.6 11.17C80.6 10.73 80.62 10.4 80.66 10.33C80.69 10.27 81 9.93 81.34 9.57C81.69 9.22 82.49 8.37 83.12 7.7C85.73 4.93 85.48 5.14 86.14 5.16L86.58 5.18L86.6 7L86.62 8.83L88.4 8.84C89.38 8.84 90.2 8.85 90.24 8.85C90.29 8.85 90.3 9.19 90.3 10.38C90.3 11.56 90.29 11.9 90.24 11.9C90.2 11.9 89.38 11.91 88.4 11.91L86.62 11.93L86.63 14.25C86.63 15.53 86.64 16.67 86.67 16.78C86.84 17.66 87.2 18.09 88.01 18.35C88.14 18.39 88.54 18.4 89.24 18.4L90.28 18.38L90.29 19.89C90.3 21.28 90.3 21.39 90.21 21.43C90.08 21.48 87.24 21.51 87.12 21.45ZM37.89 21.36L35.71 21.35L35.29 20.79C35.06 20.48 34.84 20.18 34.8 20.12C34.76 20.06 34.56 19.79 34.35 19.52C34.14 19.26 33.94 18.99 33.9 18.93C33.86 18.87 33.68 18.63 33.5 18.4C32.92 17.63 32.55 17.13 32.41 16.91C32.34 16.8 32.25 16.69 32.22 16.68C32.19 16.67 32.01 16.84 31.82 17.06C31.63 17.28 31.4 17.55 31.31 17.65C31.15 17.84 31.15 17.84 31.14 19.58L31.12 21.33L29.16 21.34L27.2 21.35L27.21 12.34L27.23 3.33L29.18 3.33L31.12 3.33L31.15 8.53C31.16 11.39 31.19 13.73 31.21 13.73C31.24 13.73 31.62 13.3 31.78 13.09C31.95 12.86 32.66 11.98 32.87 11.74C33.08 11.51 33.28 11.26 33.91 10.47C35.15 8.92 35.19 8.88 35.45 8.84C35.81 8.79 39.55 8.8 39.58 8.86C39.6 8.89 39.52 9 39.41 9.12C39.31 9.23 39.12 9.45 39 9.6C38.87 9.75 38.7 9.95 38.62 10.05C38.53 10.15 38.3 10.42 38.1 10.65C37.9 10.88 37.61 11.22 37.46 11.4C37.3 11.57 37.13 11.78 37.08 11.85C36.95 12.01 36.53 12.5 36.12 12.95C35.61 13.52 34.98 14.26 34.96 14.3C34.95 14.34 35.27 14.83 35.35 14.9C35.37 14.91 35.43 15 35.5 15.1C35.57 15.2 35.76 15.45 35.92 15.66C36.09 15.87 36.3 16.14 36.39 16.26C36.48 16.38 36.68 16.63 36.83 16.82C36.98 17.02 37.15 17.25 37.22 17.35C37.32 17.5 37.67 17.95 38.14 18.55C38.21 18.64 38.53 19.06 38.85 19.48C39.17 19.89 39.6 20.46 39.82 20.74C40.16 21.19 40.27 21.44 40.11 21.39C40.09 21.38 39.09 21.37 37.89 21.36ZM104.06 21.35C102.37 21.33 102.08 21.31 102.05 21.25C102.03 21.21 101.89 20.87 101.75 20.5C101.6 20.13 101.47 19.8 101.45 19.78C101.43 19.75 101.36 19.59 101.3 19.43C101.24 19.26 101.16 19.05 101.12 18.95C101.07 18.85 101.02 18.73 101 18.68C100.98 18.62 100.93 18.5 100.88 18.4C100.64 17.85 100.2 16.73 100.2 16.67C100.2 16.63 100.18 16.6 100.15 16.6C100.12 16.6 100.1 16.57 100.1 16.52C100.1 16.48 100.08 16.41 100.06 16.36C100.03 16.31 99.99 16.22 99.96 16.15C99.93 16.08 99.88 15.95 99.83 15.85C99.79 15.75 99.68 15.47 99.57 15.23C99.47 14.98 99.35 14.68 99.3 14.57C99.24 14.46 99.1 14.11 98.97 13.79C98.84 13.48 98.71 13.15 98.66 13.05C98.57 12.82 98.53 12.73 98.4 12.38C98.34 12.21 98.27 12.05 98.24 12.03C98.22 12 98.2 11.95 98.2 11.91C98.2 11.88 98.16 11.75 98.1 11.64C98.05 11.52 97.89 11.13 97.75 10.78C97.51 10.17 97.39 9.9 97.23 9.53C97.14 9.35 97 8.94 97 8.89C97 8.87 97.95 8.85 99.11 8.86L101.21 8.88L101.36 9.28C101.44 9.5 101.53 9.71 101.55 9.76C101.58 9.81 101.6 9.88 101.6 9.93C101.6 9.97 101.62 10.05 101.65 10.1C101.68 10.16 101.72 10.24 101.75 10.3C101.78 10.35 101.8 10.44 101.8 10.5C101.8 10.55 101.82 10.61 101.85 10.62C101.88 10.64 101.9 10.71 101.9 10.78C101.9 10.84 101.92 10.91 101.94 10.92C101.96 10.93 102.01 11.06 102.05 11.2C102.09 11.34 102.14 11.47 102.16 11.48C102.18 11.49 102.2 11.56 102.2 11.62C102.2 11.68 102.22 11.75 102.23 11.77C102.27 11.8 102.29 11.84 102.52 12.5C102.6 12.71 102.67 12.92 102.7 12.98C102.72 13.03 102.77 13.15 102.8 13.25C102.83 13.35 102.88 13.47 102.9 13.53C102.92 13.58 103 13.79 103.08 14C103.15 14.21 103.23 14.44 103.26 14.53C103.29 14.61 103.33 14.7 103.36 14.72C103.38 14.75 103.4 14.82 103.4 14.88C103.4 14.94 103.42 15.01 103.45 15.03C103.48 15.04 103.5 15.11 103.5 15.18C103.5 15.24 103.52 15.31 103.54 15.32C103.56 15.33 103.61 15.46 103.65 15.6C103.69 15.74 103.74 15.87 103.76 15.88C103.78 15.89 103.8 15.96 103.8 16.03C103.8 16.09 103.82 16.16 103.85 16.18C103.88 16.19 103.9 16.26 103.9 16.32C103.9 16.38 103.91 16.45 103.93 16.47C103.95 16.48 104.03 16.68 104.1 16.9C104.33 17.56 104.25 17.67 104.95 15.68C105.03 15.43 105.13 15.19 105.15 15.14C105.18 15.09 105.2 15.02 105.2 14.98C105.2 14.93 105.22 14.86 105.25 14.81C105.28 14.76 105.38 14.49 105.47 14.2C105.57 13.91 105.72 13.45 105.82 13.18C105.92 12.9 106.06 12.51 106.13 12.3C106.2 12.09 106.27 11.88 106.3 11.83C106.36 11.69 106.57 11.1 106.7 10.7C106.76 10.52 106.83 10.34 106.85 10.29C106.88 10.24 106.9 10.16 106.9 10.1C106.9 10.05 106.92 9.99 106.95 9.98C106.98 9.96 107 9.89 107 9.83C107 9.77 107.02 9.7 107.03 9.68C107.05 9.66 107.13 9.48 107.2 9.26L107.33 8.88L108.1 8.85C109.33 8.81 111.4 8.85 111.4 8.91C111.4 8.94 111.36 9.04 111.32 9.14C111.28 9.24 111.22 9.37 111.2 9.43C111.18 9.48 111.1 9.65 111.03 9.81C110.96 9.97 110.9 10.11 110.9 10.13C110.9 10.14 110.83 10.29 110.75 10.48C110.67 10.66 110.6 10.82 110.6 10.85C110.6 10.88 110.58 10.94 110.56 10.99C110.53 11.04 110.49 11.13 110.46 11.2C110.38 11.42 110.29 11.62 110.24 11.71C110.22 11.76 110.2 11.82 110.2 11.85C110.2 11.88 110.16 12 110.11 12.11C110.05 12.23 109.96 12.45 109.9 12.6C109.84 12.75 109.76 12.95 109.71 13.05C109.67 13.15 109.62 13.27 109.6 13.33C109.56 13.43 109.48 13.62 109.3 14.03C109.24 14.16 109.18 14.32 109.15 14.38C109.13 14.43 109.06 14.58 109 14.71C108.95 14.84 108.9 14.98 108.9 15.01C108.9 15.05 108.88 15.1 108.86 15.13C108.83 15.15 108.74 15.37 108.65 15.6C108.45 16.13 108.43 16.17 108.3 16.47C108.24 16.6 108.15 16.83 108.09 16.97C108.04 17.11 107.94 17.34 107.87 17.49C107.8 17.63 107.75 17.78 107.75 17.82C107.75 17.85 107.73 17.9 107.71 17.93C107.69 17.95 107.62 18.1 107.55 18.25C107.49 18.4 107.41 18.6 107.36 18.7C107.26 18.95 107.19 19.11 107.15 19.23C107.11 19.33 107.04 19.5 106.96 19.71C106.93 19.79 106.87 19.91 106.84 19.99C106.81 20.06 106.77 20.17 106.75 20.23C106.73 20.28 106.69 20.38 106.66 20.45C106.43 20.97 106.35 21.17 106.35 21.23C106.35 21.31 106.19 21.41 106.09 21.39C106.05 21.38 105.14 21.37 104.06 21.35ZM40.8 15.11C40.8 9.93 40.81 8.86 40.87 8.83C40.9 8.82 41.71 8.81 42.65 8.82L44.38 8.83L44.4 9.7C44.42 10.43 44.44 10.58 44.5 10.58C44.54 10.58 44.6 10.52 44.63 10.46C44.73 10.25 45.51 9.5 45.85 9.28C46.27 9.01 46.55 8.88 47.1 8.71C47.48 8.59 48.34 8.52 49.04 8.54L49.3 8.55L49.3 10.4L49.3 12.26L49.04 12.23C47.06 12.03 45.84 12.46 45.15 13.59C44.78 14.23 44.78 14.13 44.75 17.93L44.73 21.33L42.76 21.34L40.8 21.35L40.8 15.11ZM92.1 15.13C92.1 10.22 92.11 8.9 92.16 8.86C92.25 8.79 95.73 8.81 95.8 8.88C95.83 8.91 95.85 10.84 95.84 15.13L95.83 21.33L93.96 21.34L92.1 21.35L92.1 15.13ZM16.69 21.21C16.65 21.16 16.56 21.04 16.5 20.93C16.44 20.82 16.27 20.53 16.13 20.3C16 20.07 15.73 19.62 15.55 19.3C15.37 18.98 15.03 18.41 14.8 18.03C14.34 17.25 14.09 16.82 13.56 15.93C13.37 15.59 13.03 15.01 12.8 14.62C12.57 14.24 12.3 13.78 12.2 13.6C12.1 13.42 11.9 13.08 11.76 12.83C11.5 12.4 11.43 12.09 11.55 11.97C11.57 11.95 11.71 11.72 11.85 11.48C12.4 10.53 12.69 10.03 13.2 9.18C13.43 8.79 13.69 8.35 13.77 8.2C13.86 8.05 14.06 7.71 14.22 7.45C14.37 7.2 14.5 6.98 14.5 6.97C14.5 6.96 14.66 6.67 14.87 6.34C15.21 5.76 15.87 4.64 16.31 3.88C16.82 3 16.76 3.01 18.03 3.76C18.16 3.85 18.35 3.96 18.45 4.01C18.55 4.07 18.65 4.13 18.68 4.15C18.7 4.17 18.93 4.31 19.18 4.45C19.42 4.6 19.69 4.75 19.78 4.8C20.46 5.2 21.28 5.72 21.34 5.79C21.46 5.95 21.6 6.31 21.6 6.48C21.6 6.63 21.31 7.26 21.15 7.48C21.13 7.5 20.99 7.73 20.85 7.98C20.7 8.22 20.55 8.49 20.5 8.58C20.45 8.66 20.3 8.92 20.16 9.15C20.03 9.38 19.73 9.89 19.5 10.28C19.27 10.66 19 11.12 18.9 11.3C18.8 11.48 18.65 11.74 18.56 11.89C18.35 12.24 18.36 12.34 18.62 12.8C18.74 13 18.89 13.28 18.96 13.4C19.03 13.52 19.3 13.98 19.55 14.43C19.8 14.87 20.08 15.35 20.16 15.5C20.25 15.65 20.35 15.83 20.4 15.9C20.47 16.01 20.84 16.65 21.33 17.54C21.74 18.27 21.58 18.64 20.56 19.24C20.24 19.43 19.81 19.69 19.6 19.81C18.78 20.3 17.97 20.78 17.93 20.79C17.91 20.8 17.71 20.92 17.49 21.06C17.06 21.32 16.82 21.37 16.69 21.21ZM72.35 18.4C72.73 18.35 72.94 18.31 73.08 18.25C74.12 17.84 74.76 17.17 75.07 16.15C75.26 15.55 75.21 14.3 74.98 13.79C74.94 13.7 74.88 13.55 74.84 13.46C74.81 13.37 74.76 13.3 74.74 13.3C74.72 13.3 74.7 13.27 74.7 13.23C74.7 13.04 73.81 12.19 73.41 12C73.28 11.94 73.14 11.87 73.09 11.84C73.04 11.82 72.96 11.8 72.9 11.8C72.85 11.8 72.79 11.78 72.78 11.76C72.74 11.69 72.42 11.65 71.83 11.62C70.11 11.53 68.72 12.56 68.3 14.23C68.13 14.9 68.16 15.4 68.43 16.3C68.48 16.46 68.68 16.83 68.84 17.05C69 17.26 69.65 17.9 69.72 17.9C69.74 17.9 69.82 17.94 69.89 17.99C70.39 18.34 71.48 18.52 72.35 18.4ZM59.81 13.66C59.9 13.57 59.4 12.71 59.06 12.39C58.39 11.76 57.75 11.53 56.65 11.53C56.03 11.53 55.86 11.55 55.48 11.66C54.91 11.81 54.33 12.19 54.08 12.57C53.75 13.08 53.5 13.64 53.59 13.69C53.66 13.74 59.76 13.71 59.81 13.66ZM121.42 13.69C121.47 13.64 121.17 13.02 120.95 12.73C120.61 12.27 119.82 11.7 119.51 11.7C119.46 11.7 119.4 11.68 119.37 11.65C119.21 11.5 117.22 11.5 117.12 11.66C117.11 11.68 117.05 11.7 117.01 11.7C116.76 11.7 116 12.19 115.69 12.55C115.43 12.85 115.05 13.64 115.14 13.7C115.21 13.73 121.39 13.73 121.42 13.69ZM93.33 7.29C92.57 7.03 92.11 6.64 91.8 5.98C91.62 5.6 91.62 4.71 91.8 4.28C92.17 3.35 92.9 2.86 94 2.81C96.64 2.7 97.32 6.36 94.82 7.24C94.49 7.36 93.61 7.39 93.33 7.29Z"/></svg>';

  // ---------- démonstration : rien ne part vers n8n (ni Telegram, ni email, ni production) ----------
  // Un envoi vers l'extérieur qui concerne un projet TEST_DEMO_* reçoit une fausse réponse « ok ».
  (function () {
    const f = window.fetch;
    if (!f || f.kDemo) return;
    const g = function (entree, init) {
      try {
        const u = new URL(typeof entree === 'string' ? entree : entree.url, location.href);
        const meth = String((init && init.method) || (entree && entree.method) || 'GET').toUpperCase();
        const corps = init && typeof init.body === 'string' ? init.body : '';
        if (u.origin !== location.origin && meth !== 'GET' &&
          (/TEST_DEMO_/.test(corps) || /TEST_DEMO_/.test(location.pathname + location.search) || /\.invalid$/.test(u.hostname)))
          return Promise.resolve(new Response(JSON.stringify({ ok: true, demo: true, message: /^en/.test(document.documentElement.lang) ? 'Demo project: nothing was sent, nobody was notified.' : 'Démo : rien n\'a été envoyé, personne n\'est prévenu.' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      } catch (e) {}
      return f.apply(this, arguments);
    };
    g.kDemo = true;
    window.fetch = g;
  })();
  K.estDemo = d => /^TEST_DEMO_/.test(String(d || ''));

  // ---------- télécharger une facture ----------
  // Une facture payée : un PDF fait ici, marqué « Payée » (le PDF de Stripe d'un paiement fait sur le site garde
  // « à régler » et « Payer en ligne », car Stripe l'émet en « envoi de facture » au moment du paiement).
  // Mêmes informations que la facture Stripe : numéro, dates, Kreative, client, ligne « Pack X » et son détail, mentions.
  // Une facture pas encore payée : le PDF de Stripe s'il existe.
  // o : { client, email, commande (numéro), projet, k (la commande, pour la ligne et son détail) }
  let jspdf = null, logoPdf = null;
  const NOMS_OPT = { express: 'Livraison express', ab_visuel: 'A/B test visuel', ab_texte: 'A/B test texte' };
  const detailFacture = k => {
    if (!k) return '';
    const m = k.formule === 'mensuel', nb = k.nb_creas || 0;
    const opts = String(k.options || '').split(',').map(x => x.trim()).filter(Boolean).map(x => {
      const [id, q] = x.split(':'), n = Number(q) || 1;
      if (id === 'variations') return (n > 1 ? n + ' variations' : '1 variation') + ' de texte (' + (n + 1) + ' textes par visuel)';
      return NOMS_OPT[id] ? NOMS_OPT[id] + (q ? ' × ' + n : '') : '';
    }).filter(Boolean);
    return [nb + (k.pack === 'custom' ? ' créatives' : ' visuels statiques') + (m ? ' par mois' : ''), 'Livrés en 1:1, 4:5 et 9:16'].concat(opts).join(' • ');
  };
  K.telechargerFacture = async (f, o) => {
    o = o || {};
    const payee = f.statut === 'payee' || !!f.payee_le;
    if (f.pdf && !payee) { const a = document.createElement('a'); a.href = f.pdf; a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); return; }
    try {
      if (!window.jspdf) { if (!jspdf) jspdf = new Promise((ok, ko) => { const sc = document.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'; sc.onload = ok; sc.onerror = ko; document.head.appendChild(sc); }); await jspdf; }
      if (logoPdf === null) logoPdf = await fetch('/ui/logo-kreative-noir.png').then(r => r.ok ? r.blob() : null).then(b => b && new Promise(ok => { const l = new FileReader(); l.onload = () => ok(l.result); l.onerror = () => ok(''); l.readAsDataURL(b); })).catch(() => '') || '';
      K.facturePdf(new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' }), f, o, logoPdf).save('Facture-' + String(f.numero || 'Kreative').replace(/[^A-Za-z0-9-]+/g, '-') + '.pdf');
    } catch (err) { K.toast('La facture n\'a pas pu se préparer.'); }
  };
  // le dessin de la facture (séparé pour le banc de test)
  K.facturePdf = (doc, f, o, logo) => {
    o = o || {};
    const e = t => String(t == null ? '' : t);
    const euros = n => (Math.round((n || 0) * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/[  ]/g, ' ') + ' €';
    const jour = t => new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }).format(new Date(t));
    const payee = f.statut === 'payee' || !!f.payee_le, k = o.k || null;
    const titre = k ? (k.formule === 'mensuel' ? 'Abonnement ' : 'Pack ') + ({ starter: 'Starter', growth: 'Growth', scale: 'Scale', custom: 'Custom' }[k.pack] || k.pack) : (o.projet || 'Créatives publicitaires Kreative');
    const detail = detailFacture(k), G = 20, D = 190, gris = () => doc.setTextColor(95), noir = () => doc.setTextColor(0);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(22); noir(); doc.text('Facture', G, 30);
    if (logo) { try { doc.addImage(logo, 'PNG', D - 46, 19, 46, 46 * 372 / 1311); } catch (x) { doc.text('kreative', D, 30, { align: 'right' }); } }
    else doc.text('kreative', D, 30, { align: 'right' });
    // numéro et dates
    doc.setFontSize(10);
    const lignes = [['Numéro de facture', f.numero || ''], ['Date d\'émission', jour(f.emise_le || Date.now())]];
    if (payee) lignes.push(['Date de paiement', jour(f.payee_le || f.emise_le || Date.now())]);
    if (o.commande && o.commande !== f.numero) lignes.push(['Commande', o.commande]);
    lignes.forEach(([a, b], n) => { doc.setFont('helvetica', 'bold'); doc.text(a, G, 44 + n * 6); doc.setFont('helvetica', 'normal'); doc.text(e(b), G + 38, 44 + n * 6); });
    // Kreative et le client
    const y0 = 44 + lignes.length * 6 + 10;
    doc.setFont('helvetica', 'bold'); doc.text('Kreative', G, y0); doc.text('Facturer à', 105, y0);
    doc.setFont('helvetica', 'normal');
    ['47 Rue Vivienne', '75002 Paris', 'France', 'contact@kreativeads.fr'].forEach((t, n) => doc.text(t, G, y0 + 6 + n * 5.5));
    [o.client || f.marque || '', o.email || ''].filter(Boolean).forEach((t, n) => doc.text(e(t), 105, y0 + 6 + n * 5.5));
    // le montant, payé
    let y = y0 + 38;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
    doc.text(payee ? euros(f.montant) + ' payés le ' + jour(f.payee_le || f.emise_le || Date.now()) : euros(f.montant) + ' à régler', G, y);
    if (detail) { doc.setFont('helvetica', 'normal'); doc.setFontSize(10); const t = doc.splitTextToSize(detail, D - G); doc.text(t, G, y + 9); y += 9 + (t.length - 1) * 5; }
    // la ligne
    y += 16; doc.setFontSize(9); doc.setFont('helvetica', 'normal'); gris();
    doc.text('Description', G, y); doc.text('Qté', 128, y, { align: 'right' }); doc.text('Prix unitaire', 158, y, { align: 'right' }); doc.text('Montant', D, y, { align: 'right' });
    doc.setDrawColor(0); doc.setLineWidth(0.4); doc.line(G, y + 2.5, D, y + 2.5);
    y += 9; noir(); doc.setFontSize(10.5);
    doc.text(e(titre), G, y); doc.text('1', 128, y, { align: 'right' }); doc.text(euros(f.montant), 158, y, { align: 'right' }); doc.text(euros(f.montant), D, y, { align: 'right' });
    // les totaux
    y += 12; doc.setLineWidth(0.2); doc.setDrawColor(215);
    const tot = [['Sous-total', euros(f.montant)], ['Total', euros(f.montant)], [payee ? 'Montant payé' : 'Montant dû', euros(f.montant)]];
    if (payee) tot.push(['Reste à payer', euros(0)]);
    tot.forEach(([a, b], n) => { const yy = y + n * 6.5; doc.line(118, yy - 4.5, D, yy - 4.5); doc.setFont('helvetica', n === 2 ? 'bold' : 'normal'); doc.text(a, 118, yy); doc.text(b, D, yy, { align: 'right' }); });
    // mentions
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); noir();
    doc.text('SIRET : 103 346 003 00017', G, 272); doc.text('TVA non applicable, art. 293 B du CGI', G, 277.5);
    if (f.numero) { gris(); doc.setFontSize(8.5); doc.text(e(f.numero) + ' · ' + euros(f.montant) + (payee ? ' · payée' : ''), D, 277.5, { align: 'right' }); }
    return doc;
  };

  // ---------- thème (clair par défaut, sombre au choix, retenu) ----------
  // les espaces de l'équipe restent en clair (les pages de production le sont) : <html data-clair>
  try { if (localStorage.getItem('k-theme') === 'dark' && !document.documentElement.hasAttribute('data-clair')) document.documentElement.dataset.theme = 'dark'; } catch (e) {}
  K.basculerTheme = () => {
    const sombre = document.documentElement.dataset.theme !== 'dark';
    document.documentElement.dataset.theme = sombre ? 'dark' : 'light';
    try { localStorage.setItem('k-theme', sombre ? 'dark' : 'light'); } catch (e) {}
    K.rendre();
  };

  // ---------- icônes (traits, 24 px) ----------
  const p = d => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
  K.i = {
    accueil: p('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>'),
    dossier: p('<path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>'),
    doc: p('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>'),
    whatsapp: '<span class="ico-wa" aria-hidden="true"></span>',   // le logo officiel (ui/whatsapp.svg, Simple Icons, CC0)
    calendrier: p('<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
    chevG: p('<path d="m14.5 6-6 6 6 6"/>'),
    chevD: p('<path d="m9.5 6 6 6-6 6"/>'),
    telephone: p('<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>'),
    cloche: p('<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15Z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>'),
    partager: p('<path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/>'),
    plusCarre: p('<rect x="4" y="4" width="16" height="16" rx="3.5"/><path d="M12 8.5v7M8.5 12h7"/>'),
    cadenas: p('<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>'),
    panier: p('<path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.5L21 8H6"/><circle cx="10" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>'),
    message: p('<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.8 8.8 0 0 1-3.5-.7L3 21l1.9-5A8.4 8.4 0 1 1 21 11.5Z"/>'),
    etoile: p('<path d="m12 4 2.5 5.2 5.5.8-4 3.9 1 5.6-5-2.7-5 2.7 1-5.6-4-3.9 5.5-.8Z"/>'),
    graph: p('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
    gens: p('<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16.5 5.2a3.2 3.2 0 0 1 0 5.6M18 20a6.4 6.4 0 0 0-2-4.6"/>'),
    sac: p('<path d="M6 7h12l1 13H5Z"/><path d="M9 7a3 3 0 0 1 6 0"/>'),
    calques: p('<path d="m12 3 9 5-9 5-9-5Z"/><path d="m3 13 9 5 9-5"/>'),
    grille: p('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'),
    colonnes: p('<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="17" y="4" width="4" height="7" rx="1.5"/>'),
    liste: p('<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>'),
    coche: p('<path d="m5 13 4 4L19 7"/>'),
    croix: p('<path d="M6 6l12 12M18 6 6 18"/>'),
    plus: p('<path d="M12 5v14M5 12h14"/>'),
    fleche: p('<path d="M5 12h14M13 6l6 6-6 6"/>'),
    gauche: p('<path d="M19 12H5m0 0 6-6m-6 6 6 6"/>'),
    externe: p('<path d="M14 4h6v6M20 4 10 14M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>'),
    chercher: p('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-3.6-3.6"/>'),
    lune: p('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>'),
    soleil: p('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    points: p('<circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="19" r="1.2"/>'),
    sortie: p('<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3"/>'),
    lien: p('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
    copier: p('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'),
    mail: p('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'),
    oeil: p('<path d="M2 12s3.8-6 10-6 10 6 10 6-3.8 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/>'),
    horloge: p('<circle cx="12" cy="12" r="9"/><path d="M12 7v5.5l3.5 2"/>'),
    image: p('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m4 17 5-5 4 4 2.5-2.5L20 17"/>'),
    crayon: p('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16Z"/>'),
    poubelle: p('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
    ampoule: p('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3Z"/>'),
    pinceau: p('<path d="M14 4l6 6-8 8H6v-6Z"/><path d="M4 20l2-2"/>'),
    envoi: p('<path d="M21 3 10.5 14M21 3l-7 18-3.5-7L3 10.5Z"/>'),
    bouclier: p('<path d="M12 3 5 6v6c0 4.2 2.9 7.8 7 9 4.1-1.2 7-4.8 7-9V6Z"/>'),
    rafraichir: p('<path d="M20 11a8 8 0 0 0-14.6-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5L20 16M20 20v-4h-4"/>'),
    menu: p('<path d="M4 6h16M4 12h16M4 18h16"/>'),
    hautBas: p('<path d="m8 9 4-4 4 4M8 15l4 4 4-4"/>'),
    recu: p('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z"/><path d="M9 8h6M9 12h6M9 16h3"/>'),
    telecharger: p('<path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5"/><path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2"/>'),
    utilisateur: p('<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>'),
    carte: p('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>'),
    telecharger: p('<path d="M12 4v11m0 0 4-4m-4 4-4-4M4 19h16"/>')
  };

  // ---------- petits outils ----------
  K.esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  K.$ = s => document.querySelector(s);
  K.date = (ms, opt) => ms ? new Intl.DateTimeFormat('fr-FR', Object.assign({ day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Paris' }, opt || {})).format(new Date(ms)) : '';
  K.dateHeure = ms => ms ? new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).format(new Date(ms)) : '';
  K.jour = ms => ms ? new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' }).format(new Date(ms)) : '';
  K.dans = ms => {
    if (!ms) return '';
    const h = (ms - Date.now()) / 3600000;
    if (h < 0) return 'dès que possible';
    if (h < 24) return 'dans moins de 24 h';
    const j = Math.round(h / 24); return 'dans ' + j + ' jour' + (j > 1 ? 's' : '');
  };
  K.euros = n => n == null || n === '' ? '0 €' : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
  K.ilya = ms => {
    if (!ms) return 'jamais';
    const s = (Date.now() - ms) / 1000;
    if (s < 60) return 'à l\'instant'; if (s < 3600) return 'il y a ' + Math.floor(s / 60) + ' min';
    if (s < 86400) return 'il y a ' + Math.floor(s / 3600) + ' h'; if (s < 86400 * 30) return 'il y a ' + Math.floor(s / 86400) + ' j';
    return K.date(ms);
  };
  // profils de l'équipe : nom complet et photo, retrouvés par le prénom de connexion
  K.PROFILS = { dario: { nom: 'Dario Crespo', photo: '/ui/profil-dario.jpg?v=2' } };
  K.profil = (nom, defaut) => {
    const p = K.PROFILS[String(nom || '').trim().toLowerCase()];
    const n = nom ? String(nom).charAt(0).toUpperCase() + String(nom).slice(1) : defaut;
    return p ? { nom: p.nom, photo: p.photo, rond: true } : { nom: n };
  };
  K.initiales = t => String(t || '?').replace(/\([^)]*\)/g, ' ').trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase() || '?';
  const TEINTES = ['#4d94ff', '#1f1f1f', '#e8834a', '#1e9e57', '#7c5cff', '#d6453d', '#c27a06', '#0f8b8d'];
  K.teinte = t => { let h = 0; for (const c of String(t || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0; return TEINTES[h % TEINTES.length]; };
  K.tuile = (t, lg) => '<span class="tuile' + (lg ? ' lg' : '') + '" style="background:' + K.teinte(t) + '">' + K.esc(K.initiales(t)) + '</span>';

  // ---------- API ----------
  K.suffixe = '';   // ?client=… en aperçu admin
  K.api = async (chemin, opt) => {
    opt = opt || {};
    const r = await fetch(chemin + (chemin.includes('?') ? '&' : '?') + 't=' + Date.now() + K.suffixe.replace('?', '&'), {
      method: opt.methode || 'GET', headers: opt.corps ? { 'Content-Type': 'application/json' } : {},
      body: opt.corps ? JSON.stringify(opt.corps) : undefined, cache: 'no-store', credentials: 'same-origin' });
    let d = null; try { d = await r.json(); } catch (e) {}
    if (!r.ok) { const err = new Error((d && (d.erreur || d.message)) || ('Erreur ' + r.status)); err.statut = r.status; throw err; }
    return d;
  };
  K.lireJson = async u => { try { const r = await fetch(u + (u.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' }); return r.ok ? await r.json() : null; } catch (e) { return null; } };

  // ---------- toast et fenêtres ----------
  K.toast = t => {
    document.querySelectorAll('.toast').forEach(x => x.remove());
    const el = document.createElement('div'); el.className = 'toast'; el.textContent = t; document.body.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  };
  K.fenetre = (html, avecFermeture) => {
    K.fermer();
    const v = document.createElement('div'); v.className = 'voile'; v.id = 'k-fen';
    v.innerHTML = '<div class="fen" role="dialog" aria-modal="true">' + html + '</div>';
    v.addEventListener('mousedown', e => { if (e.target === v && avecFermeture !== false) K.fermer(); });
    document.body.appendChild(v);
    const f = v.querySelector('input,select,textarea'); if (f) setTimeout(() => f.focus(), 30);
    return v;
  };
  K.fermer = () => { const v = document.getElementById('k-fen'); if (v) v.remove(); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (document.querySelector('.sel-pan')) K.fermerListes(); else K.fermer(); } });

  // ---------- listes déroulantes maison ----------
  // Chaque <select class="in"> est doublé d'un bouton et d'une liste stylés.
  // Le vrai select reste la source de vérité (valeur, événement change),
  // il est seulement caché : les formulaires et les onchange marchent pareil.
  const CHEVRON = '<svg class="sel-fl" viewBox="0 0 12 8" fill="none"><path d="M1 1.5 6 6.5l5-5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  K.fermerListes = () => { document.querySelectorAll('.sel-pan').forEach(x => x.remove()); document.querySelectorAll('.sel.ouvert').forEach(x => x.classList.remove('ouvert')); };
  K.listes = racine => {
    (racine || document).querySelectorAll('select.in:not([data-k])').forEach(sel => {
      sel.dataset.k = '1';
      const boite = document.createElement('div');
      boite.className = 'sel';
      if (sel.getAttribute('style')) { boite.setAttribute('style', sel.getAttribute('style')); sel.removeAttribute('style'); }
      sel.parentNode.insertBefore(boite, sel); boite.appendChild(sel);
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'sel-btn';
      if (sel.id) btn.setAttribute('aria-labelledby', sel.id);
      boite.appendChild(btn);
      const maj = () => { const o = sel.options[sel.selectedIndex]; btn.innerHTML = '<span>' + K.esc(o ? o.text : '') + '</span>' + CHEVRON; btn.disabled = sel.disabled; };
      maj(); sel.addEventListener('change', maj); sel._kMaj = maj;
      const choisir = n => { if (n === sel.selectedIndex) { K.fermerListes(); return; } sel.selectedIndex = n; maj(); K.fermerListes(); sel.dispatchEvent(new Event('change', { bubbles: true })); };
      const ouvrir = () => {
        K.fermerListes();
        boite.classList.add('ouvert');
        const pan = document.createElement('div'); pan.className = 'sel-pan'; pan.setAttribute('role', 'listbox');
        pan.innerHTML = Array.from(sel.options).map((o, n) => '<div class="sel-opt' + (n === sel.selectedIndex ? ' on act' : '') + (o.disabled ? ' off' : '') + '" data-n="' + n + '" role="option">' +
          '<span>' + K.esc(o.text) + '</span>' + (n === sel.selectedIndex ? K.i.coche : '') + '</div>').join('');
        document.body.appendChild(pan);
        const r = btn.getBoundingClientRect(), h = Math.min(pan.scrollHeight, 300), bas = window.innerHeight - r.bottom;
        pan.style.left = r.left + 'px'; pan.style.minWidth = r.width + 'px';
        pan.style.top = (bas < h + 16 && r.top > bas ? r.top - h - 6 : r.bottom + 6) + 'px';
        const on = pan.querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest' });
        pan.addEventListener('mousedown', e => e.preventDefault());
        pan.addEventListener('click', e => { const it = e.target.closest('.sel-opt'); if (it && !it.classList.contains('off')) choisir(Number(it.dataset.n)); });
        pan.addEventListener('mousemove', e => { const it = e.target.closest('.sel-opt'); if (it) { pan.querySelectorAll('.act').forEach(x => x.classList.remove('act')); it.classList.add('act'); } });
      };
      btn.addEventListener('click', e => { e.stopPropagation(); if (boite.classList.contains('ouvert')) K.fermerListes(); else ouvrir(); });
      btn.addEventListener('keydown', e => {
        const pan = document.querySelector('.sel-pan');
        if (!pan) { if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); ouvrir(); } return; }
        const opts = Array.from(pan.querySelectorAll('.sel-opt:not(.off)')); let n = opts.findIndex(x => x.classList.contains('act'));
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault(); if (n >= 0) opts[n].classList.remove('act');
          n = Math.max(0, Math.min(opts.length - 1, n + (e.key === 'ArrowDown' ? 1 : -1))); opts[n].classList.add('act'); opts[n].scrollIntoView({ block: 'nearest' });
        }
        if ((e.key === 'Enter' || e.key === ' ') && n >= 0) { e.preventDefault(); choisir(Number(opts[n].dataset.n)); }
        if (e.key === 'Tab') K.fermerListes();
      });
    });
  };
  document.addEventListener('click', () => K.fermerListes());
  window.addEventListener('resize', () => K.fermerListes());
  document.addEventListener('scroll', e => { if (!(e.target.closest && e.target.closest('.sel-pan'))) K.fermerListes(); }, true);
  let attente = 0;
  new MutationObserver(() => { if (!attente) attente = requestAnimationFrame(() => { attente = 0; K.listes(); }); })
    .observe(document.documentElement, { childList: true, subtree: true });

  // ---------- export CSV (s'ouvre dans Excel, Numbers, Google Sheets) ----------
  K.csv = (nom, entetes, lignes) => {
    const cel = v => { const t = v == null ? '' : String(v); return /[";\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
    const texte = '\ufeff' + [entetes, ...lignes].map(l => l.map(cel).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([texte], { type: 'text/csv;charset=utf-8' }));
    a.download = nom + '-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };

  // ---------- commandes : un nom lisible et un statut ----------
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const NOMS_PACKS = { starter: 'Starter', growth: 'Growth', scale: 'Scale', custom: 'Custom' };
  // « Pack Growth · octobre 2026 » ou « Abonnement Growth · novembre 2026 »
  K.nomCommande = c => {
    const d = new Date(c.cree_le || Date.now());
    return (c.formule === 'mensuel' ? 'Abonnement ' : 'Pack ') + (NOMS_PACKS[c.pack] || c.pack) + ' · ' + MOIS[d.getMonth()] + ' ' + d.getFullYear();
  };
  // le statut vu par le client et par l'admin, à partir de l'état calculé par le serveur
  // l'état vient du serveur ; à défaut (ancienne version du Worker), il se déduit du statut
  K.etatCle = c => c.etat || ({ brief: 'confirmee', production: 'production' }[c.statut] || c.statut || 'production');
  K.etatCommande = c => {
    const e = K.etatCle(c);
    return ({ confirmee: ['Commande confirmée', 'a'], production: ['En production', 'b'], livre: ['Livré · à valider', 'g'], revisions: ['Retouches en cours', 'v'],
      valide: ['Validé', 'g'], annule: ['Annulée', ''] })[e] || ['En cours', 'b'];
  };
  K.pillCommande = c => { const [t, p] = K.etatCommande(c); return '<span class="pill ' + p + '"><i></i>' + K.esc(t) + '</span>'; };
  K.copier = async (t, msg) => {
    try { await navigator.clipboard.writeText(t); } catch (e) {
      const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); document.execCommand('copy'); a.remove();
    }
    K.toast(msg || 'Copié');
  };
  K.confirmer = (titre, texte, bouton, danger) => new Promise(ok => {
    const v = K.fenetre('<div class="fen-h"><h2>' + K.esc(titre) + '</h2><p>' + K.esc(texte) + '</p></div>' +
      '<div class="fen-f"><button class="btn btn-s" data-n>Annuler</button><button class="btn ' + (danger ? 'btn-r' : 'btn-p') + '" data-o>' + K.esc(bouton) + '</button></div>');
    v.querySelector('[data-n]').onclick = () => { K.fermer(); ok(false); };
    v.querySelector('[data-o]').onclick = () => { K.fermer(); ok(true); };
  });

  // ---------- routeur (#/ecran/param) ----------
  K.route = () => { const h = (location.hash || '#/').slice(2).split('?')[0]; const [ecran, ...rest] = h.split('/'); return { ecran: ecran || '', params: rest }; };
  K.aller = h => { if (location.hash === h) K.rendre(); else location.hash = h; };
  window.addEventListener('hashchange', () => { K.fermerMenu(); K.rendre(); const s = document.querySelector('.scroll'); if (s) s.scrollTop = 0; });

  // ---------- coquille ----------
  // conf : { cta:{texte,href}, sections:[{titre, liens:[{id,texte,icone,href,nb,ext}]}], qui:{nom,role}, sortie, recherche:fn }
  K.coquille = (conf, actif, ariane, contenu, large) => {
    const nav = conf.sections.map(s => (s.titre ? '<div class="nav-lab">' + K.esc(s.titre) + '</div>' : '') +
      '<nav class="nav">' + s.liens.map(l => '<a href="' + K.esc(l.href) + '"' + (l.ext ? ' target="_blank" rel="noopener"' : '') +
        ' class="' + (l.id === actif ? 'on' : '') + '">' + K.i[l.icone] + '<span>' + K.esc(l.texte) + '</span>' +
        (l.nb ? '<span class="nb">' + l.nb + '</span>' : '') + (l.ext ? K.i.externe.replace('<svg', '<svg class="ext"') : '') + '</a>').join('') + '</nav>').join('');
    const sombre = document.documentElement.dataset.theme === 'dark';
    return '<div class="app" id="k-app">' +
      '<div class="side-voile" id="k-voile" aria-hidden="true"></div><aside class="side"><div class="side-logo">' + K.logo + '</div>' +
      (conf.cta ? '<a class="side-cta" href="' + K.esc(conf.cta.href) + '">' + K.esc(conf.cta.texte) + K.i.fleche.replace('<svg', '<svg width="16" height="16"') + '</a>' : '') +
      '<div class="side-nav">' + nav + '</div>' +
      // toute la zone du profil ouvre le menu du compte
      '<div class="side-foot"><div class="menu" id="k-menu" hidden>' + (conf.menu || []).join('') +
      (conf.sansTheme || conf.clair ? '' : '<button id="k-theme2">' + (sombre ? K.i.soleil : K.i.lune) + (sombre ? 'Thème clair' : 'Thème sombre') + '</button>') +
      '<a href="' + K.esc(conf.sortie) + '">' + K.i.sortie + (conf.anglais ? 'Log out' : 'Se déconnecter') + '</a></div>' +
      '<button class="compte" id="k-menu-btn" aria-label="Menu du compte" aria-expanded="false">' +
      (conf.qui.photo ? '<img class="av-img' + (conf.qui.rond ? ' rond' : '') + '" src="' + K.esc(conf.qui.photo) + '" alt="">' : conf.qui.tuile ? K.tuile(conf.qui.nom) : '<span class="av">' + K.esc(K.initiales(conf.qui.nom)) + '</span>') +
      '<span class="qui"><b>' + K.esc(conf.qui.nom) + '</b><small>' + K.esc(conf.qui.role) + '</small></span>' + K.i.hautBas + '</button></div></aside>' +
      '<div class="main"><div class="panel"><header class="top">' +
      '<button class="icon-btn burger" id="k-burger" aria-label="Menu">' + K.i.menu + '</button>' +
      '<div class="ariane">' + ariane + '</div>' +
      (conf.recherche ? '<div class="search">' + K.i.chercher + '<input id="k-cherche" placeholder="' + K.esc(conf.cherche || 'Rechercher un client, un projet, un dossier…') + '" autocomplete="off"><kbd>⌘K</kbd><div class="res" id="k-res" hidden></div></div>' : '') +
      (conf.clair ? '' : '<div class="top-r"><button class="icon-btn" id="k-theme" title="' + (sombre ? 'Thème clair' : 'Thème sombre') + '">' + (sombre ? K.i.soleil : K.i.lune) + '</button></div>') +
      '</header><div class="scroll"><div class="page' + (large === 'plein' ? ' plein' : large === 'centre' ? ' centre' : large ? ' large' : '') + '">' + contenu + '</div></div></div></div></div>';
  };
  K.brancherCoquille = conf => {
    const b = id => document.getElementById(id);
    if (b('k-theme')) b('k-theme').onclick = K.basculerTheme;
    if (b('k-theme2')) b('k-theme2').onclick = K.basculerTheme;
    // menu mobile : le voile à côté le referme toujours, comme un lien du menu (même vers la page déjà ouverte)
    if (b('k-burger')) b('k-burger').onclick = e => { e.stopPropagation(); b('k-app').classList.toggle('menu-ouvert'); };
    if (b('k-voile')) b('k-voile').onclick = e => { e.stopPropagation(); K.fermerMenu(); };
    document.querySelectorAll('.side a').forEach(a => a.addEventListener('click', () => setTimeout(K.fermerMenu, 0)));
    if (b('k-menu-btn')) b('k-menu-btn').onclick = e => { e.stopPropagation(); b('k-menu').hidden = !b('k-menu').hidden; b('k-menu-btn').setAttribute('aria-expanded', String(!b('k-menu').hidden)); };
    if (!K.ecouteMenu) {   // une seule fois : un clic ailleurs referme le menu du compte
      K.ecouteMenu = true;
      document.addEventListener('click', e => { const m = document.getElementById('k-menu'); if (m && !m.hidden && !e.target.closest('#k-menu')) { m.hidden = true; const mb = document.getElementById('k-menu-btn'); if (mb) mb.setAttribute('aria-expanded', 'false'); } });
      document.addEventListener('keydown', e => { if (e.key === 'Escape') K.fermerMenu(); });
    }
    if (conf.recherche && b('k-cherche')) {
      const champ = b('k-cherche'), res = b('k-res'); let sel = 0, items = [];
      const montrer = () => {
        items = conf.recherche(champ.value.trim()); sel = 0;
        res.hidden = !champ.value.trim();
        res.innerHTML = items.length ? items.map((x, i) => '<a href="' + K.esc(x.href) + '"' + (x.ext ? ' target="_blank" rel="noopener"' : '') + ' class="' + (i === 0 ? 'sel' : '') + '">' +
          (K.i[x.icone] || '').replace('<svg', '<svg width="15" height="15"') + '<span>' + K.esc(x.texte) + '</span><small>' + K.esc(x.type) + '</small></a>').join('')
          : '<div class="vide" style="padding:16px">Aucun résultat</div>';
      };
      champ.oninput = montrer;
      champ.onkeydown = e => {
        const liens = res.querySelectorAll('a');
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!liens.length) return; liens[sel].classList.remove('sel'); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + liens.length) % liens.length; liens[sel].classList.add('sel'); }
        if (e.key === 'Enter' && liens[sel]) { liens[sel].click(); res.hidden = true; champ.value = ''; }
        if (e.key === 'Escape') { res.hidden = true; champ.blur(); }
      };
      champ.onblur = () => setTimeout(() => { res.hidden = true; }, 150);
    }
  };
  K.fermerMenu = () => { const m = document.getElementById('k-menu'); if (m) m.hidden = true; const mb = document.getElementById('k-menu-btn'); if (mb) mb.setAttribute('aria-expanded', 'false'); const a = document.getElementById('k-app'); if (a) a.classList.remove('menu-ouvert'); };
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { const c = document.getElementById('k-cherche'); if (c) { e.preventDefault(); c.focus(); c.select(); } }
  });
  K.ariane = (icone, ...parts) => (K.i[icone] || '') + parts.map((x, i) => i === parts.length - 1 ? '<b>' + K.esc(x) + '</b>' : '<span>' + K.esc(x) + '</span><i>/</i>').join(' ');

  // ---------- étapes ----------
  // une étape « option » (l'avis) ne compte pas dans l'avancement
  K.etapes = liste => '<div class="etapes">' + liste.map((e, i) => {
    const cours = !e.fait && liste.slice(0, i).every(x => x.fait);
    const marque = e.fait ? K.i.coche : e.option ? K.i.etoile : i + 1;
    return '<div class="etape ' + (e.fait ? 'fait' : cours ? 'cours' : 'attente') + (e.option ? ' opt' : '') + '"><span class="o">' + marque + '</span>' +
      (cours ? '<span class="t"><b>' + K.esc(e.titre) + '</b>' + (e.detail ? '<small>' + K.esc(e.detail) + '</small>' : '') + '</span><span class="pill b"><i></i>' + (e.option ? 'À vous' : 'En cours') + '</span>'
        : '<span class="t">' + K.esc(e.titre) + '</span>') + '</div>';
  }).join('') + '</div>';

  // ============================================================
  //  PRODUCTION : les projets du dépôt et leurs pages, ouvertes
  //  DANS le portail (cadre intégré), avec un choix du projet.
  //  Utilisé par l'admin, l'espace stratégiste et l'espace designer.
  // ============================================================
  const P = K.prod = { liste: null };
  P.charger = async force => {
    if (P.liste && !force) return P.liste;
    let projets = await K.lireJson('/projets.json');
    if (!Array.isArray(projets)) projets = [];
    P.sigListe = projets.map(x => x && x.dossier).filter(Boolean).sort().join(',');
    P.liste = (await Promise.all(projets.filter(x => x && x.dossier && !/^TEST_(?!DEMO_)/i.test(x.dossier)).map(async x => {
      const [d, envois, liv, retour] = await Promise.all(['donnees', 'envois', 'livraison', 'retour'].map(f => K.lireJson('/' + x.dossier + '/' + f + '.json')));
      const aRetour = !!(retour && retour.dossier === x.dossier);
      if (!d) return null;
      const ev = (envois && Array.isArray(envois.envois)) ? envois.envois : [];
      const dernier = ev[ev.length - 1];
      const livs = (liv && liv.livraisons) || [], der = livs[livs.length - 1] || {};
      const l = d.livraison;
      return { dossier: x.dossier, demo: K.estDemo(x.dossier), d, prod: (l && l.projet) || x.dossier, marque: d.brand_name || x.dossier,
        nom: (d.brand_name || x.dossier) + (l && l.sur > 1 ? ' · livraison ' + l.n + '/' + l.sur : ''),
        nb: d.nb_creas || x.nb_creas || 0, pack: d.pack || x.pack || '', retour: aRetour, retourLe: aRetour ? Date.parse(retour.recu_le || '') || 0 : 0,
        envoye: ev.length > 0, envoyeLe: Date.parse(typeof dernier === 'string' ? dernier : (dernier || {}).le || '') || 0,
        livre: !!(liv && liv.livre), livreLe: Date.parse(der.le || '') || 0, zip: der.lien || '', livraisons: livs,
        strat: Date.parse(d.deadline_strategiste || '') || 0, desi: Date.parse(d.deadline_designer || '') || 0, client: Date.parse(d.deadline || '') || 0 };
    }))).filter(Boolean);
    await P.chargerEtats();
    return P.liste;
  };
  // Les options payées par le client. Variations de texte (depuis le 22/10/2026) : sur chaque créa, le même
  // visuel avec 1 ou 2 textes en plus (« variations:2 » = 3 textes par créa), dans chaque livraison.
  // Anciennes commandes : A/B test visuel (n créas en plus) et A/B test texte (n versions B en plus), qu'un
  // Custom livré en plusieurs fois répartit entre ses livraisons. Express : délais divisés par deux.
  P.part = (total, l) => !(l && l.sur > 1) ? total : Math.floor(total / l.sur) + ((l.n || 1) <= total % l.sur ? 1 : 0);
  P.lireOptions = (s, l) => {
    const o = { abv: 0, abt: 0, vari: 0, express: false };
    String(s || '').split(',').forEach(x => { const [id, q] = x.split(':'); if (id === 'express') o.express = true;
      else if (id === 'variations') o.vari = Math.min(2, Math.max(1, Number(q) || 1));
      else if (id === 'ab_visuel') o.abv = P.part(Number(q) || 0, l); else if (id === 'ab_texte') o.abt = P.part(Number(q) || 0, l); });
    return o;
  };
  // le nombre de créatives à produire : celles du pack (× les textes des variations), plus les anciens A/B tests
  P.total = x => (Number(x.nb) || 0) * (1 + ((x.opts || {}).vari || 0)) + ((x.opts || {}).abv || 0) + ((x.opts || {}).abt || 0);
  P.optionsTexte = (x, en) => {
    const o = x.opts || {}, t = [];
    if (o.vari) t.push(en ? 'Copy variations: ' + (o.vari + 1) + ' texts per creative' : 'Variations de texte : ' + (o.vari + 1) + ' textes par créa');
    if (o.abv) t.push(en ? 'A/B visual test on ' + o.abv + ' creative' + (o.abv > 1 ? 's' : '') : 'A/B visuel sur ' + o.abv + ' créa' + (o.abv > 1 ? 's' : ''));
    if (o.abt) t.push(en ? 'A/B copy test on ' + o.abt + ' creative' + (o.abt > 1 ? 's' : '') : 'A/B texte sur ' + o.abt + ' créa' + (o.abt > 1 ? 's' : ''));
    if (o.express) t.push('Express');
    return t.join(' · ');
  };
  P.celluleOptions = (x, en) => { const t = P.optionsTexte(x, en); return t ? '<span class="sub" style="color:var(--blue-tx)">' + K.esc(t) + '</span>' : ''; };
  // l'état de production, calculé de la même façon pour l'admin, le stratégiste et la designer :
  // la dernière version déposée dans le portail, un déplacement fait dans le Kanban, la commande du client
  P.chargerEtats = async donnees => {
    let r = donnees;
    if (!r) { try { r = await K.api('/api/equipe/etats'); } catch (e) { r = { etats: {}, commandes: {} }; } }
    P.etats = r;
    (P.liste || []).forEach(x => {
      const e = (r.etats || {})[x.dossier] || {};
      x.v = e.v || null; x.o = e.o || null;
      const l = x.d.livraison, base = (l && l.projet) || x.dossier;
      x.k = (r.commandes || {})[x.dossier] || ((!l || !(l.sur > 1) || l.n >= l.sur) ? (r.commandes || {})[base] : null) || null;
      x.opts = P.lireOptions((r.options || {})[x.dossier] || (r.options || {})[base] || '', l);
      if (x.livreDepot === undefined) x.livreDepot = x.livre;
      x.etape = P.etape(x);
      x.livre = ['livrer', 'client'].includes(x.etape.cle);
      if (x.v && x.v.statut !== 'brouillon' && x.livre) x.livreLe = Math.max(x.livreLe || 0, x.v.le || 0);
    });
  };
  // tout le monde voit la même chose en même temps : l'état est relu toutes les 20 s (et au retour sur l'onglet),
  // et la page se redessine seulement s'il a changé, jamais pendant une saisie, une fenêtre ou un glisser
  P.surveiller = rendre => {
    if (P.surveille) return; P.surveille = true;
    let signature = JSON.stringify(P.etats || {});
    const verifier = async () => {
      if (document.visibilityState !== 'visible' || !P.liste) return;
      const a = document.activeElement;
      if (a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && a.type !== 'checkbox')) || document.querySelector('#k-fen, .rv-v, .kdrag, .kplace, .cal, .vp-cadre, .envoi-l:not(.fini), .envoye-anim, .toast')) return;
      // un nouveau projet (ou un projet archivé) : la liste est relue pour tout le monde, sans recharger la page
      const pj = await K.lireJson('/projets.json');
      const liste = Array.isArray(pj) ? pj.map(x => x && x.dossier).filter(Boolean).sort().join(',') : null;
      if (liste !== null && P.sigListe !== undefined && liste !== P.sigListe) { P.sigListe = liste; await P.charger(true); signature = JSON.stringify({ etats: (P.etats || {}).etats, commandes: (P.etats || {}).commandes }); rendre(); return; }
      if (liste !== null) P.sigListe = liste;
      let r; try { r = await K.api('/api/equipe/etats'); } catch (e) { return; }
      const sig = JSON.stringify({ etats: r.etats, commandes: r.commandes });
      if (sig === signature) return;
      signature = sig; await P.chargerEtats(r); rendre();
    };
    signature = JSON.stringify({ etats: (P.etats || {}).etats, commandes: (P.etats || {}).commandes });
    setInterval(verifier, 20000);
    document.addEventListener('visibilitychange', verifier);
  };
  P.etape = x => {
    const v = x.v;
    let cle, retouche = null, ts = 0;
    if (v) {
      ts = v.le || 0;
      if (v.statut === 'a_verifier') cle = 'livrer';
      else if (['envoyee', 'approuvee'].includes(v.statut)) cle = 'client';
      else if (['a_corriger', 'review_terminee'].includes(v.statut)) { retouche = v.retouche || 'designer'; cle = retouche === 'strategiste' ? 'strat' : 'desi'; }
      else cle = 'desi';
    } else {
      ts = Math.max(x.envoyeLe || 0, x.livreLe || 0);
      cle = x.k && ['livre', 'revisions', 'valide'].includes(x.k) ? 'client' : x.livreDepot ? 'livrer' : x.envoye ? 'desi' : 'strat';
    }
    let manuel = false;
    if (x.o && x.o.etape && x.o.le > ts) { cle = x.o.etape; manuel = true; retouche = null; }
    return { cle, retouche, manuel, statut: v ? v.statut : null, version: v ? v.version : 0, valide: x.k === 'valide' };
  };
  P.trouver = id => (P.liste || []).find(x => x.dossier === id) || (P.liste || []).find(x => x.prod === id) || null;

  // une échéance lisible : « Dans 2 jours », « Dans 5 h », « En retard »
  P.echeance = (t, en) => {
    if (!t) return { pill: '', texte: en ? 'no deadline' : 'pas d\'échéance', retard: false };
    const reste = t - Date.now(), H = 36e5;
    if (reste < 0) return { pill: '<span class="pill r"><i></i>' + (en ? 'Late' : 'En retard') + '</span>', texte: en ? 'late' : 'en retard', retard: true };
    if (reste < 12 * H) { const h = Math.max(1, Math.round(reste / H)); return { pill: '<span class="pill n">' + (en ? 'Due in ' : 'Dans ') + h + ' h</span>', texte: (en ? 'in ' : 'dans ') + h + ' h' }; }
    const j = Math.round(reste / 24 / H), t2 = (en ? 'in ' : 'dans ') + j + (en ? ' day' : ' jour') + (j > 1 ? 's' : '');
    return { pill: '<span class="pill b"><i></i>' + t2.charAt(0).toUpperCase() + t2.slice(1) + '</span>', texte: t2 };
  };
  // où en est un projet de production
  P.etat = (x, en) => {
    const g = x.etape;
    if (g && g.retouche && g.cle === 'desi') return { cle: 'desi', texte: en ? (g.statut === 'a_corriger' ? 'Sent back to you' : 'Client feedback to fix') : 'Retouches · visuels', pill: 'v' };
    if (g && g.retouche && g.cle === 'strat') return { cle: 'strat', texte: en ? 'Copy fixes by the strategist' : 'Retouches · textes', pill: 'v' };
    if (g && g.cle === 'strat' && x.envoye) return { cle: 'strat', texte: en ? 'With the strategist' : 'Chez le stratégiste', pill: 'b' };
    if (g && g.cle === 'desi') { const e = P.echeance(x.desi, en); return { cle: 'desi', texte: e.retard ? (en ? 'Late' : 'Designer en retard') : (en ? 'To deliver' : 'Chez le designer'), pill: e.retard ? 'r' : 'v' }; }
    if (!x.envoye) { const e = P.echeance(x.strat, en); return { cle: 'strat', texte: e.retard ? (en ? 'Brief late' : 'Fiche en retard') : (en ? 'With the strategist' : 'Fiche à remplir'), pill: e.retard ? 'r' : 'b' }; }
    if (!x.livre) { const e = P.echeance(x.desi, en); return { cle: 'desi', texte: e.retard ? (en ? 'Late' : 'Designer en retard') : (en ? 'To deliver' : 'Chez le designer'), pill: e.retard ? 'r' : 'v' }; }
    return { cle: 'livre', texte: en ? 'Delivered' : 'Livré par le designer', pill: 'g' };
  };
  P.pill = (x, en) => { const e = P.etat(x, en); return '<span class="pill ' + e.pill + '"><i></i>' + K.esc(e.texte) + '</span>'; };
  // ce que voit le stratégiste : seulement SA fiche (à remplir, en retard, envoyée à l'heure ou non)
  P.etatStrat = x => {
    if (x.etape && x.etape.retouche === 'strategiste' && x.etape.cle === 'strat') return { cle: 'retouches', texte: 'Retouches de textes', pill: 'v' };
    if (x.etape && x.etape.cle === 'strat' && x.envoye) return { cle: 'afaire', texte: 'Fiche à reprendre', pill: 'b' };
    if (!x.envoye) return x.strat && x.strat < Date.now() ? { cle: 'retard', texte: 'Fiche en retard', pill: 'r' } : { cle: 'afaire', texte: 'Fiche à remplir', pill: 'b' };
    if (x.strat && x.envoyeLe > x.strat) { const h = Math.max(1, Math.round((x.envoyeLe - x.strat) / 36e5)); return { cle: 'tard', texte: 'Envoyée avec ' + (h >= 24 ? Math.round(h / 24) + ' j' : h + ' h') + ' de retard', pill: 'a' }; }
    return { cle: 'heure', texte: 'Envoyée à l\'heure', pill: 'g' };
  };
  P.pillStrat = x => { const e = P.etatStrat(x); return '<span class="pill ' + e.pill + '"><i></i>' + K.esc(e.texte) + '</span>'; };
  // le type de projet, dit clairement : commande unique, sur-mesure en plusieurs livraisons, abonnement
  const MOIS_P = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  P.type = (x, en) => {
    const d = x.d || {}, l = d.livraison;
    if (d.abonnement || (l && l.type === 'abonnement')) { const m = new Date(x.client || Date.now()).getMonth(); return { t: en ? 'Subscription' : 'Abonnement', s: en ? 'month of ' + ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m] : 'mois de ' + MOIS_P[m] }; }
    if (l && l.sur > 1) return { t: en ? 'Custom, split' : 'Sur-mesure', s: (en ? 'delivery ' : 'livraison ') + l.n + (en ? ' of ' : ' sur ') + l.sur };
    return { t: en ? 'One-off order' : 'Commande unique', s: 'Pack ' + ((x.pack || '').charAt(0).toUpperCase() + (x.pack || '').slice(1)) };
  };
  P.celluleType = (x, en) => { const t = P.type(x, en); return '<b style="font-weight:500">' + K.esc(t.t) + '</b><span class="sub">' + K.esc(t.s) + '</span>'; };
  P.celluleCreas = (x, en) => { const l = (x.d || {}).livraison, tot = P.total(x), plus = tot - (Number(x.nb) || 0);
    const vari = (x.opts || {}).vari || 0, ab = plus - (Number(x.nb) || 0) * vari;
    return '<b style="font-weight:500">' + K.esc(tot || '?') + '</b>' + (vari ? '<span class="sub">' + x.nb + (en ? ' × ' + (vari + 1) + ' texts' : ' × ' + (vari + 1) + ' textes') + '</span>' : '') +
      (ab ? '<span class="sub">' + (vari ? '' : x.nb) + ' + ' + ab + ' A/B</span>' : '') +
      (l && l.sur > 1 && l.total_creas ? '<span class="sub">' + (en ? 'of ' : 'sur ') + l.total_creas + (en ? ' in total' : ' au total') + '</span>' : ''); };

  // les sections et la page qu'elles ouvrent
  P.sections = {
    fiche: { fr: 'Fiches créas', en: 'Strategy briefs', icone: 'doc', ok: () => true, src: x => '/fiche/?projet=' + encodeURIComponent(x.dossier) },
    dossier: { fr: 'Dossiers de production', en: 'Production files', icone: 'calques', ok: x => x.prod === x.dossier || !(P.liste || []).some(y => y.dossier === x.prod), src: x => '/' + x.prod + '/' },
    brief: { fr: 'Briefs suivants', en: 'Next briefs', icone: 'message', ok: x => x.retour, src: x => '/retours/?projet=' + encodeURIComponent(x.dossier) },
    visuels: { fr: 'Visuels', en: 'Previews', icone: 'image', ok: x => x.envoye, src: x => '/' + x.dossier + '/creas/' },
    telechargement: { fr: 'Téléchargements', en: 'Downloads', icone: 'telecharger', ok: x => x.envoye, src: x => '/' + x.dossier + '/creas/telecharger.html' }
  };
  const avecIntegre = u => u + (u.includes('?') ? '&' : '?') + 'integre=1';
  // une adresse de page de production → la route du portail
  P.route = chemin => {
    const u = new URL(chemin, location.origin), q = u.searchParams.get('projet'), c = u.pathname;
    let m;
    if (/^\/fiche\/(index\.html)?$/.test(c)) return 'fiche' + (q ? '/' + q : '');
    if (/^\/retours\/(index\.html)?$/.test(c)) return 'brief' + (q ? '/' + q : '');
    if ((m = c.match(/^\/([A-Za-z0-9_-]+)\/creas\/telecharger\.html$/))) return 'telechargement/' + m[1];
    if ((m = c.match(/^\/([A-Za-z0-9_-]+)\/creas\/(index\.html)?$/))) return 'visuels/' + m[1];
    if ((m = c.match(/^\/([A-Za-z0-9_-]+)\/(index\.html)?$/)) && !/^(admin|client|strategiste|designer|fiche|retours|ui)$/.test(m[1])) return 'dossier/' + m[1];
    return null;
  };
  // une page intégrée demande à ouvrir une autre page de production : on reste dans le portail
  window.addEventListener('message', e => {
    if (e.origin !== location.origin || !e.data || e.data.kreative !== 'aller') return;
    const r = P.route(e.data.chemin);
    if (r && P.autorisees && !P.autorisees.includes(r.split('/')[0])) { location.href = e.data.chemin; return; }
    if (r) K.aller('#/' + r); else location.href = e.data.chemin;
  });

  // la liste des projets d'une section (quand aucun n'est choisi)
  P.liste_ = (sec, opt) => {
    const S = P.sections[sec], en = opt.en, strat = opt.role === 'strategiste', l = (P.liste || []).filter(S.ok).sort((a, b) => (b.envoyeLe || b.strat || 0) - (a.envoyeLe || a.strat || 0));
    let h = '<div class="ph"><div><h1>' + K.esc(en ? S.en : S.fr) + '</h1><p>' + K.esc(opt.texte || (en ? 'Choose a project.' : 'Choisissez un projet.')) + '</p></div>' +
      '</div>';
    if (!l.length) return h + '<div class="card"><div class="vide">' + K.i[S.icone] + K.esc(en ? 'Nothing here yet.' : 'Rien ici pour le moment.') + '</div></div>';
    const brief = sec === 'brief';
    return h + '<div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>' + (en ? 'Project' : 'Projet') + '</th><th>Type</th><th class="num">' + (en ? 'Creatives' : 'Créas à faire') + '</th>' +
      (brief ? '<th>' + (en ? 'Received' : 'Reçu le') + '</th>' : '') + '<th>' + (en ? 'Status' : 'Statut') + '</th><th>' + (en ? 'Due' : 'À rendre avant') + '</th><th></th></tr></thead><tbody>' +
      l.map(x => {
        const ech = strat || !x.envoye ? x.strat : !x.livre ? x.desi : x.client;
        return '<tr class="clic" onclick="location.hash=\'#/' + sec + '/' + K.esc(x.dossier) + '\'"><td><div class="nom">' + K.tuile(x.marque) + '<div><b>' + K.esc(x.marque) + (x.demo ? ' <span class="pill demo">' + (en ? 'Demo' : 'Démo') + '</span>' : '') + '</b><span class="sub">' + K.esc(x.dossier) + '</span></div></div></td>' +
          '<td>' + P.celluleType(x, en) + '</td><td class="num">' + P.celluleCreas(x, en) + '</td>' +
          (brief ? '<td>' + (x.retourLe ? K.esc(K.dateHeure(x.retourLe)) : '<span class="muted">Pas encore</span>') + '</td>' : '') +
          '<td>' + (strat ? P.pillStrat(x) : P.pill(x, en)) + '</td><td>' + (ech ? K.esc(K.dateHeure(ech)) : '<span class="muted">Pas de date</span>') + '</td>' +
          '<td class="fin"><span class="btn btn-s btn-sm">' + (en ? 'Open' : 'Ouvrir') + ' ' + K.i.fleche.replace('<svg', '<svg width="14" height="14"') + '</span></td></tr>';
      }).join('') + '</tbody></table></div></div>';
  };
  // la page d'un projet, dans le portail : barre (projet, autres pages) + la page en cadre
  P.vue = (sec, id, opt) => {
    const S = P.sections[sec], en = opt.en, secs = opt.sections || Object.keys(P.sections);
    const x = id === 'banque' ? null : P.trouver(id);
    const src = id === 'banque' ? '/fiche/' : x ? S.src(x) : sec === 'dossier' ? '/' + id + '/' : sec === 'visuels' ? '/' + id + '/creas/' : sec === 'telechargement' ? '/' + id + '/creas/telecharger.html' : sec === 'brief' ? '/retours/?projet=' + encodeURIComponent(id) : '/fiche/?projet=' + encodeURIComponent(id);
    const choix = (P.liste || []).filter(S.ok);
    if (x && !choix.includes(x)) choix.unshift(x);
    const autres = x ? secs.filter(k => k !== sec && P.sections[k].ok(x)) : [];
    return '<div class="vp"><div class="vp-barre"><a class="btn btn-g btn-sm" href="#/' + sec + '">' + K.i.gauche + K.esc(en ? S.en : S.fr) + '</a>' +
      '<div class="vp-choix"><select class="in" id="vp-projet">' + (id === 'banque' ? '<option value="banque" selected>' + (en ? 'Inspiration bank' : 'Banque d\'inspirations') + '</option>' : '') +
      (!x && id !== 'banque' ? '<option value="' + K.esc(id) + '" selected>' + K.esc(id) + '</option>' : '') +
      choix.map(y => '<option value="' + K.esc(y.dossier) + '"' + (x === y ? ' selected' : '') + '>' + K.esc(y.nom) + ' · ' + K.esc(y.nb || '?') + (en ? ' creatives' : ' créas') + '</option>').join('') + '</select></div>' +
      (x ? (opt.role === 'strategiste' ? P.pillStrat(x) : P.pill(x, en)) : '') +
      (autres.length ? '<div class="vp-autres">' + autres.map(k => '<a class="btn btn-s btn-sm" href="#/' + k + '/' + K.esc(x.dossier) + '">' + K.i[P.sections[k].icone] + K.esc(en ? P.sections[k].en : P.sections[k].fr) + '</a>').join('') + '</div>' : '') +
      '</div><iframe class="vp-cadre" id="vp-cadre" src="' + K.esc(avecIntegre(src)) + '" title="' + K.esc(en ? S.en : S.fr) + '"></iframe></div>';
  };
  P.brancher = sec => {
    const s = document.getElementById('vp-projet');
    if (s) s.onchange = () => K.aller('#/' + sec + '/' + s.value);
  };
})();
