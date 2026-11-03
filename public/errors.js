export function explainError(message) {
  if (message.includes('IndexError')) return 'リストの範囲外を参照しています。要素の数と指定した番号を確認しましょう。';
  if (message.includes('KeyError')) return '指定した名前の列やキーがありません。名前を確認しましょう。';
  if (message.includes('EOFError')) return '入力を受け取る回数が、問題で用意した入力の数を超えています。';
  if (message.includes('RecursionError')) return '関数が自分自身を呼び出し続けています。終了条件を確認しましょう。';
  if (message.includes('ValueError')) return '数値に変換できませんでした。整数なら「123」、小数なら「3.14」のように入力しましょう。';
  const name = message.match(/NameError: name ['"](.+?)['"] is not defined/);
  if (name) return `変数「${name[1]}」がまだ作成されていません。先に値を代入しましょう。`;
  if (message.includes('ZeroDivisionError')) return '0で割ることはできません。割る数を確認しましょう。';
  if (message.includes('TypeError')) return '値の種類が合っていません。数値と文字列を混ぜて計算していないか確認しましょう。';
  if (message.includes('SyntaxError')) return 'プログラムの書き方を確認しましょう。ブロックの入力がすべて埋まっているか確認してください。';
  if (message.includes('OverflowError')) return '数値が大きすぎます。繰り返し回数や計算する値を小さくしましょう。';
  return '実行できませんでした。下の詳細とブロックの入力を確認しましょう。';
}
export function classifyError(message){return String(message).match(/\b(NameError|TypeError|ValueError|IndexError|KeyError|ZeroDivisionError|SyntaxError|IndentationError|OverflowError|EOFError|RecursionError)\b/)?.[1]||'UnknownError';}
