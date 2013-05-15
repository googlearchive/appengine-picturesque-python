from jinja2 import Environment, PackageLoader


ENV = Environment(loader=PackageLoader(__name__, '.'))
TEMPLATE = ENV.get_template('index-template.html')


with open('index.html', 'wb') as fh:
  lines = TEMPLATE.render().split('\n')
  # No trailing whitespace
  lines = [row.rstrip() for row in lines]
  result = '\n'.join(lines)
  if not result.endswith('\n'):
    result += '\n'
  fh.write(result)
