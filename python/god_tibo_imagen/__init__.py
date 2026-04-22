from pathlib import Path
from pkgutil import extend_path

__path__ = extend_path(__path__, __name__)
src_pkg = Path(__file__).resolve().parent.parent / "src" / "god_tibo_imagen"
if src_pkg.exists():
    __path__.append(str(src_pkg))
