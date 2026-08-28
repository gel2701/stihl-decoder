import React from 'react';

interface SerialDecoderFormProps {
  initialModelHint?: string;
}

export function SerialDecoderForm({ initialModelHint }: SerialDecoderFormProps) {
  return (
    <form action="/" method="GET" class="space-y-4">
      <p class="text-xs text-gray-400">
        Vul hieronder het serienummer in van uw {initialModelHint || 'STIHL machine'} om formaat- en herkomstsignalen op te vragen. Gebruik het typeplaatje of een primaire bron om model en bouwjaar te bevestigen:
      </p>
      <div class="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          name="q"
          placeholder={`Bijv. 184592301 of ${initialModelHint || 'MS 261 C-M'}...`}
          class="flex-1 bg-gray-950 border border-gray-700 rounded-xl px-4 py-3 text-white font-mono text-base placeholder-gray-500 focus:outline-none focus:border-orange-500"
          autocomplete="off"
        />
        <button
          type="submit"
          class="bg-orange-600 hover:bg-orange-500 text-white font-bold px-6 py-3 rounded-xl transition shadow-md shadow-orange-600/30 flex items-center justify-center gap-2 cursor-pointer"
        >
          <span>Controleer Serienummer</span>
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>
      </div>
    </form>
  );
}
