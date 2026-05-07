"""
ASE 兼容性补丁
ASE 3.28+ 将 ExpCellFilter 从 ase.constraints 移至 ase.filters，
此补丁在旧位置创建别名，确保 PyXplore 能正常导入。
"""
import ase.constraints
import ase.filters

ase.constraints.ExpCellFilter = ase.filters.ExpCellFilter
