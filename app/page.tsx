import React from "react";

export default function Home() {
  return (
    <main className="min-h-screen bg-white flex flex-col items-center justify-center px-4">
      {/* Illustration */}
      <div className="mb-4">
        <svg
          width="120"
          height="120"
          viewBox="0 0 120 120"
          aria-hidden="true"
          className="mx-auto"
        >
          <rect x="14" y="26" width="92" height="64" rx="10" fill="#EEF2FF" />
          <rect x="30" y="42" width="60" height="8" rx="4" fill="#6366f1" />
          <rect x="30" y="56" width="43" height="8" rx="4" fill="#a5b4fc" />
          <rect x="30" y="70" width="30" height="8" rx="4" fill="#c7d2fe" />
        </svg>
      </div>
      {/* Title */}
      <h1 className="text-3xl font-semibold text-slate-800 mb-3 text-center">
        Reporting Financier
      </h1>
      {/* Description */}
      <p className="text-slate-600 text-center mb-8 max-w-md">
        Présentez facilement vos finances à votre équipe.
        <br />
        Analyse rapide & visualisations claires.
        <br />
        Conçu pour la simplicité et l’efficacité.
      </p>
      {/* Call-to-action buttons */}
      <div className="flex gap-4">
        <a
          href="/auth/signin"
          className="px-6 py-2 rounded-md bg-slate-900 text-white font-medium text-sm shadow-sm hover:bg-slate-800 transition"
        >
          Connexion
        </a>
        <a
          href="/auth/signup"
          className="px-6 py-2 rounded-md border border-slate-200 bg-white text-slate-900 font-medium text-sm shadow-sm hover:bg-slate-100 transition"
        >
          Créer une entreprise
        </a>
      </div>
    </main>
  );
}
