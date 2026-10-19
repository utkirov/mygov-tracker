import { parseRepositoryFiles } from '../repository-files';

// Trimmed from a real my.gov.uz status page of a finalized (rejected) application.
const REAL_BLOCK_HTML = `
<div class="collapse in" id="DIKNdcI">
  <p><div class="repo-file-view last ">
    <div class="repo-svg">
      <div class="text-vertical">
        <div><a href="https://repository.gov.uz/file/get-document/9505-776a-5f00-e070-d0e1-8521-6479" target="_blank">Просмотр</a></div>
        <div><a href="https://repository.gov.uz/file/download?guid=9505-776a-5f00-e070-d0e1-8521-6479" target="_blank">Скачать</a></div>
      </div>
    </div>
    <div class="repo-title">Уведомление об отказе в согласовании проектно-сметной документации</div>
    <table>
      <tbody>
        <tr class="repo-name"><td>Состояние</td><td>PIN</td></tr>
        <tr><td>Действительный</td><td class="red">4057</td></tr>
      </tbody>
    </table></div></p>
</div>`;

describe('parseRepositoryFiles', () => {
  it('extracts guid, title, state and pin from a real finalized-application block', () => {
    const files = parseRepositoryFiles(REAL_BLOCK_HTML);
    expect(files).toEqual([{
      guid: '9505-776a-5f00-e070-d0e1-8521-6479',
      title: 'Уведомление об отказе в согласовании проектно-сметной документации',
      state: 'Действительный',
      pin: '4057',
    }]);
  });

  it('returns [] for a page without the repository block', () => {
    expect(parseRepositoryFiles('<html><body><table><tr><th>Состояние</th><td>Новое</td></tr></table></body></html>')).toEqual([]);
  });

  it('skips entries without a parseable guid', () => {
    const broken = '<div class="repo-file-view"><div class="repo-title">Без ссылки</div></div>';
    expect(parseRepositoryFiles(broken)).toEqual([]);
  });
});
