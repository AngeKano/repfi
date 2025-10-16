import React from "react";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col justify-center items-center bg-gradient-to-br from-blue-50 to-indigo-100 overflow-hidden">
      <h1 className="text-4xl font-bold mb-6 tracking-wide text-slate-800 animate-fadeInDown">
        AI Excel Transformer
      </h1>
      <p className="text-lg text-slate-700 mb-10 text-center max-w-xl animate-fadeIn">
        Transformez vos fichiers Excel en un clin d'œil . Choisissez votre outil
        :
      </p>
      <ul className="flex gap-8 animate-fadeInUp">
        <li>
          <a
            href="/gl-tiers"
            className="inline-block px-8 py-4 rounded-3xl bg-indigo-500 text-white font-semibold text-base no-underline shadow-lg transition-transform duration-200 hover:scale-105 focus:scale-105 animate-popIn"
            style={{ animationDelay: "0.6s", animationFillMode: "both" }}
          >
            Grand Livre Tiers
          </a>
        </li>
        <li>
          <a
            href="/gl-comptes"
            className="inline-block px-8 py-4 rounded-3xl bg-emerald-500 text-white font-semibold text-base no-underline shadow-lg transition-transform duration-200 hover:scale-105 focus:scale-105 animate-popIn"
            style={{ animationDelay: "0.8s", animationFillMode: "both" }}
          >
            Grand Livre Comptes
          </a>
        </li>
        <li>
          <a
            href="/gl-fusion"
            className="inline-block px-8 py-4 rounded-3xl bg-orange-400 text-white font-semibold text-base no-underline shadow-lg transition-transform duration-200 hover:scale-105 focus:scale-105 animate-popIn"
            style={{ animationDelay: "1s", animationFillMode: "both" }}
          >
            Fusion Grand Livres
          </a>
        </li>

        <li>
          <a
            href="/cd-journeaux"
            className="inline-block px-8 py-4 rounded-3xl bg-purple-400 text-white font-semibold text-base no-underline shadow-lg transition-transform duration-200 hover:scale-105 focus:scale-105 animate-popIn"
            style={{ animationDelay: "1s", animationFillMode: "both" }}
          >
            Code Journeaux
          </a>
        </li>
        <li>
          <a
            href="/pl-comptable"
            className="inline-block px-8 py-4 rounded-3xl bg-cyan-600 text-white font-semibold text-base no-underline shadow-lg transition-transform duration-200 hover:scale-105 focus:scale-105 animate-popIn"
            style={{ animationDelay: "1s", animationFillMode: "both" }}
          >
            Plan Comptable
          </a>
        </li>
      </ul>
    </main>
  );
}
