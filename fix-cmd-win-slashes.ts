type QuotesPosition = { from: number, to: number }

export function fixCmdWinSlashes(cmd: string): string {
  function findQuotes(quoteSymbol: string): QuotesPosition[] {
    const quotes: QuotesPosition[] = [];
    const addQuote = (_: string, index: number) => {
      quotes.push({ from: index, to: index + _.length });
      return _;
    };
    const regEx = new RegExp(quoteSymbol + '.*' + quoteSymbol);
    cmd.replace(regEx, addQuote);
    return quotes;
  }
  const quotes = findQuotes('"').concat(findQuotes('\''));

  function isInsideQuotes(index: number): boolean {
    return quotes.reduce((result, quote) => {
      return result || (quote.from <= index && index <= quote.to);
    }, false);
  }

  const cmdPrePattern = '((?:^|&&|&|\\|\\||\\|)\\s*)';
  const cmdPattern = '(".*?"|\'.*?\'|\\S*)';
  const regExp = new RegExp(`${cmdPrePattern}${cmdPattern}`, 'g');
  return cmd.replace(regExp, (whole, pre, cmd, index) => {
    if ((pre[0] === '&' || pre[0] === '|') && isInsideQuotes(index)) {
      return whole;
    }
    return pre + cmd.replace(/\//g, '\\');
  });
}